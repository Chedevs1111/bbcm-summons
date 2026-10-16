/**
 * Court bundle export for Court Online / CaseLines.
 *
 * Builds a paginated, indexed, bookmarked PDF/A bundle from a matter's generated
 * documents and uploaded annexures, split into volumes per Gauteng Consolidated
 * Practice Directive 1 of 2024 para 33.25.
 */

import {
  DOCUMENT_TYPE_LABELS,
  FILING_ORDER,
  annexureLabel,
  type GeneratedDocument,
  type Matter,
  type MatterAttachment,
} from '@bbcm/schema';
import {
  buildCourtBundle,
  buildCourtHeading,
  type BundleAnnexure,
  type BundleMeta,
} from '@bbcm/documents';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { audit } from '../lib/audit.js';
import { requireStorage, loadOwnedMatter, requireAuth, type Env, type Variables } from '../lib/context.js';
import { buildMatterContext } from '../lib/matters.js';

export const bundleRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
bundleRoutes.use('*', requireAuth);

/** R2 reads are the slow part, so cap how much a single bundle will pull in. */
const MAX_ANNEXURE_BYTES = 60 * 1024 * 1024;

interface PreparedBundle {
  meta: BundleMeta;
  documents: Array<{ document_type: string; title: string; body: string }>;
  annexures: BundleAnnexure[];
  oversized: string[];
}

/**
 * Gathers everything a bundle needs.
 *
 * Only the latest version of each generated document is included — a bundle showing
 * two drafts of the same particulars would be worse than useless in court.
 */
async function prepare(c: Parameters<typeof loadOwnedMatter>[0], matter: Matter): Promise<PreparedBundle> {
  const ctx = await buildMatterContext(c.env, matter);

  const { results: generated } = await c.env.DB.prepare(
    `SELECT * FROM generated_documents WHERE matter_id = ?1 ORDER BY document_type, version DESC`,
  )
    .bind(matter.id)
    .all<GeneratedDocument>();

  const latestByType = new Map<string, GeneratedDocument>();
  for (const document of generated) {
    if (!latestByType.has(document.document_type)) latestByType.set(document.document_type, document);
  }

  // Filing order, not creation order — the bundle must read as a court file.
  const documents = FILING_ORDER.map((type) => latestByType.get(type))
    .filter((document): document is GeneratedDocument => document !== undefined)
    .map((document) => ({
      document_type: document.document_type,
      title: document.title,
      body: document.body,
    }));

  const { results: attachments } = await c.env.DB.prepare(
    'SELECT * FROM matter_attachments WHERE matter_id = ?1 ORDER BY sort_order',
  )
    .bind(matter.id)
    .all<MatterAttachment>();

  const annexures: BundleAnnexure[] = [];
  const oversized: string[] = [];
  let budget = MAX_ANNEXURE_BYTES;

  for (const [index, attachment] of attachments.entries()) {
    if (attachment.size_bytes > budget) {
      oversized.push(attachment.file_name);
      continue;
    }
    const object = await requireStorage(c.env).get(attachment.storage_key);
    if (!object) {
      oversized.push(attachment.file_name);
      continue;
    }
    const bytes = new Uint8Array(await object.arrayBuffer());
    budget -= bytes.byteLength;
    annexures.push({
      label: attachment.annexure_label || annexureLabel(index),
      description: DOCUMENT_TYPE_LABELS[attachment.document_type] ?? attachment.document_type,
      fileName: attachment.file_name,
      contentType: attachment.content_type,
      bytes,
    });
  }

  const meta: BundleMeta = {
    caseNumber: matter.case_number || '______________',
    caseReference: matter.case_reference,
    courtHeading: buildCourtHeading(matter),
    parties: [
      {
        name: `${matter.plaintiff_full_names} ${matter.plaintiff_surname}`.trim().toUpperCase(),
        role: 'PLAINTIFF',
      },
      {
        name: `${matter.defendant_full_names} ${matter.defendant_surname}`.trim().toUpperCase(),
        role: 'DEFENDANT',
      },
    ],
    firmName: ctx.firm.name.toUpperCase(),
    firmAddress: [ctx.firm.address, ctx.firm.city, ctx.firm.province].filter(Boolean).join(', '),
    firmPhone: ctx.firm.phone,
    firmEmail: ctx.firm.email,
    attorneyName: ctx.attorney?.full_name ?? '',
  };

  return { meta, documents, annexures, oversized };
}

function bundleFileName(matter: Matter, volumeNumber: number, totalVolumes: number): string {
  // Court Online matches uploads to a case by the reference a human reads, so lead
  // with the case number and keep the name free of characters filesystems dislike.
  const reference = (matter.case_number || matter.case_reference || matter.id.slice(0, 8))
    .replace(/[\\/:*?"<>|]/g, '-');
  const parties = `${matter.plaintiff_surname || 'Plaintiff'} v ${matter.defendant_surname || 'Defendant'}`
    .replace(/[\\/:*?"<>|]/g, '-');
  const volume = totalVolumes > 1 ? ` Volume ${volumeNumber} of ${totalVolumes}` : '';
  return `${reference} ${parties} - Court Bundle${volume}.pdf`;
}

/** Manifest: what the bundle would contain, without downloading it. */
bundleRoutes.get('/:matterId/bundle', async (c) => {
  const matter = await loadOwnedMatter<Matter>(c, c.req.param('matterId'));
  const prepared = await prepare(c, matter);

  if (prepared.documents.length === 0) {
    throw new HTTPException(422, {
      message: 'Generate the pleadings before building a court bundle.',
    });
  }

  const result = await buildCourtBundle({
    meta: prepared.meta,
    documents: prepared.documents,
    annexures: prepared.annexures,
    splitIntoVolumes: c.req.query('split') !== 'false',
  });

  return c.json({
    total_pages: result.totalPages,
    index: result.index,
    volumes: result.volumes.map((volume) => ({
      volume_number: volume.volumeNumber,
      first_page: volume.firstPage,
      last_page: volume.lastPage,
      page_count: volume.pageCount,
      size_bytes: volume.bytes.byteLength,
      file_name: bundleFileName(matter, volume.volumeNumber, result.volumes.length),
      entries: volume.entries,
    })),
    warnings: {
      unreadable_annexures: result.unreadableAnnexures,
      skipped_annexures: prepared.oversized,
    },
  });
});

/** Downloads one volume as PDF. */
bundleRoutes.get('/:matterId/bundle/:volume', async (c) => {
  const matter = await loadOwnedMatter<Matter>(c, c.req.param('matterId'));
  const requested = Number(c.req.param('volume'));
  if (!Number.isInteger(requested) || requested < 1) {
    throw new HTTPException(400, { message: 'Volume must be a positive whole number' });
  }

  const prepared = await prepare(c, matter);
  if (prepared.documents.length === 0) {
    throw new HTTPException(422, {
      message: 'Generate the pleadings before building a court bundle.',
    });
  }

  const result = await buildCourtBundle({
    meta: prepared.meta,
    documents: prepared.documents,
    annexures: prepared.annexures,
    splitIntoVolumes: c.req.query('split') !== 'false',
  });

  const volume = result.volumes.find((v) => v.volumeNumber === requested);
  if (!volume) {
    throw new HTTPException(404, {
      message: `This bundle has ${result.volumes.length} volume(s)`,
    });
  }

  await audit(c, {
    action: 'bundle.export',
    entity: 'generated_documents',
    matter_id: matter.id,
    detail: `volume ${requested} of ${result.volumes.length}, ${volume.pageCount} pages`,
  });

  const fileName = bundleFileName(matter, volume.volumeNumber, result.volumes.length);

  return new Response(volume.bytes as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
