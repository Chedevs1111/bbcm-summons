import {
  FILING_ORDER,
  GENERATED_DOCUMENT_TYPES,
  type GeneratedDocument,
  type GeneratedDocumentType,
  type Matter,
} from '@bbcm/schema';
import { assembleBundle, parseDocument, renderDocx, renderHtml } from '@bbcm/documents';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { audit } from '../lib/audit.js';
import { loadOwnedMatter, requireAuth, type Env, type Variables } from '../lib/context.js';
import { buildMatterContext } from '../lib/matters.js';

export const documentRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
documentRoutes.use('*', requireAuth);

documentRoutes.get('/:matterId/documents', async (c) => {
  const matter = await loadOwnedMatter<Matter>(c, c.req.param('matterId'));
  const { results } = await c.env.DB.prepare(
    `SELECT id, matter_id, document_type, title, version, created_at
     FROM generated_documents WHERE matter_id = ?1 ORDER BY created_at DESC`,
  )
    .bind(matter.id)
    .all();
  return c.json({ documents: results });
});

/** Renders without saving — powers the Template Designer's live preview. */
documentRoutes.post('/:matterId/documents/preview', async (c) => {
  const matter = await loadOwnedMatter<Matter>(c, c.req.param('matterId'));
  const body: { document_types?: GeneratedDocumentType[] } = await c.req
    .json<{ document_types?: GeneratedDocumentType[] }>()
    .catch(() => ({}));

  const requested = (body.document_types ?? FILING_ORDER).filter(
    (type: GeneratedDocumentType) => GENERATED_DOCUMENT_TYPES.includes(type),
  );

  const ctx = await buildMatterContext(c.env, matter);
  const assembled = assembleBundle(ctx, requested);

  return c.json({
    documents: assembled.map((doc) => ({
      document_type: doc.document_type,
      title: doc.title,
      html: doc.html,
      text: doc.text,
    })),
    skipped: requested.filter(
      (type: GeneratedDocumentType) => !assembled.some((doc) => doc.document_type === type),
    ),
  });
});

documentRoutes.post('/:matterId/documents/generate', async (c) => {
  const matter = await loadOwnedMatter<Matter>(c, c.req.param('matterId'));
  const body: { document_types?: GeneratedDocumentType[] } = await c.req
    .json<{ document_types?: GeneratedDocumentType[] }>()
    .catch(() => ({}));

  const requested = (body.document_types ?? FILING_ORDER).filter(
    (type: GeneratedDocumentType) => GENERATED_DOCUMENT_TYPES.includes(type),
  );
  if (requested.length === 0) {
    throw new HTTPException(400, { message: 'Select at least one document to generate' });
  }

  const ctx = await buildMatterContext(c.env, matter);
  const assembled = assembleBundle(ctx, requested);

  if (assembled.length === 0) {
    throw new HTTPException(422, {
      message:
        'No template matches this matter. Check the Template Designer for a template covering this marriage regime and contested status.',
    });
  }

  // Versions are per matter + document type, so regenerating keeps an auditable history.
  const { results: versions } = await c.env.DB.prepare(
    'SELECT document_type, MAX(version) AS v FROM generated_documents WHERE matter_id = ?1 GROUP BY document_type',
  )
    .bind(matter.id)
    .all<{ document_type: string; v: number }>();
  const latest = new Map(versions.map((row) => [row.document_type, row.v]));

  const userId = c.get('user').id;
  const created = assembled.map((doc) => ({
    id: crypto.randomUUID(),
    document_type: doc.document_type,
    title: doc.title,
    body: doc.body,
    version: (latest.get(doc.document_type) ?? 0) + 1,
  }));

  await c.env.DB.batch(
    created.map((doc) =>
      c.env.DB.prepare(
        `INSERT INTO generated_documents
          (id, matter_id, document_type, title, body, version, generated_by)
         VALUES (?1,?2,?3,?4,?5,?6,?7)`,
      ).bind(doc.id, matter.id, doc.document_type, doc.title, doc.body, doc.version, userId),
    ),
  );

  await c.env.DB.prepare(
    "UPDATE matters SET status = 'generated', updated_at = datetime('now') WHERE id = ?1",
  )
    .bind(matter.id)
    .run();

  await audit(c, {
    action: 'document.generate',
    entity: 'generated_documents',
    matter_id: matter.id,
    detail: created.map((doc) => `${doc.document_type} v${doc.version}`).join(', '),
  });

  const skipped = requested.filter(
    (type: GeneratedDocumentType) => !assembled.some((doc) => doc.document_type === type),
  );

  return c.json({
    documents: created.map((doc, index) => ({
      ...doc,
      html: assembled[index]!.html,
      text: assembled[index]!.text,
    })),
    skipped,
  }, 201);
});

documentRoutes.get('/:matterId/documents/:id', async (c) => {
  const matter = await loadOwnedMatter<Matter>(c, c.req.param('matterId'));
  const document = await c.env.DB.prepare(
    'SELECT * FROM generated_documents WHERE id = ?1 AND matter_id = ?2',
  )
    .bind(c.req.param('id'), matter.id)
    .first<GeneratedDocument>();

  if (!document) throw new HTTPException(404, { message: 'Document not found' });

  const ast = parseDocument(document.body);
  return c.json({ document, html: renderHtml(ast) });
});

/** Word export. PDF export is produced client-side from the same HTML via print-to-PDF. */
documentRoutes.get('/:matterId/documents/:id/docx', async (c) => {
  const matter = await loadOwnedMatter<Matter>(c, c.req.param('matterId'));
  const document = await c.env.DB.prepare(
    'SELECT * FROM generated_documents WHERE id = ?1 AND matter_id = ?2',
  )
    .bind(c.req.param('id'), matter.id)
    .first<GeneratedDocument>();

  if (!document) throw new HTTPException(404, { message: 'Document not found' });

  const bytes = await renderDocx(parseDocument(document.body), document.title);
  const reference = matter.case_reference || matter.case_number || matter.id.slice(0, 8);
  const fileName = `${reference} ${document.title}.docx`.replace(/[\\/:*?"<>|]/g, '-');

  await audit(c, {
    action: 'document.export',
    entity: 'generated_documents',
    entity_id: document.id,
    matter_id: matter.id,
    detail: 'docx',
  });

  return new Response(bytes as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
