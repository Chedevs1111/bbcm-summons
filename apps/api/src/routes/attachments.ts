import { DOCUMENT_TYPES, annexureLabel, type DocumentType, type Matter, type MatterAttachment } from '@bbcm/schema';
import { renumberAnnexures } from '@bbcm/documents';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { audit } from '../lib/audit.js';
import { requireStorage, loadOwnedMatter, requireAuth, type Env, type Variables } from '../lib/context.js';
import { extractDocument, mapFieldToColumn } from '../extract/claude.js';

export const attachmentRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
attachmentRoutes.use('*', requireAuth);

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf',
]);

attachmentRoutes.get('/:matterId/attachments', async (c) => {
  const matter = await loadOwnedMatter<Matter>(c, c.req.param('matterId'));
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM matter_attachments WHERE matter_id = ?1 ORDER BY sort_order',
  )
    .bind(matter.id)
    .all<MatterAttachment>();
  return c.json({ attachments: results });
});

attachmentRoutes.post('/:matterId/attachments', async (c) => {
  const matter = await loadOwnedMatter<Matter>(c, c.req.param('matterId'));

  const form = await c.req.formData();
  const file = form.get('file');
  const documentType = String(form.get('document_type') ?? 'other') as DocumentType;

  if (!(file instanceof File)) throw new HTTPException(400, { message: 'No file was uploaded' });
  if (!DOCUMENT_TYPES.includes(documentType)) {
    throw new HTTPException(400, { message: 'Unknown document type' });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new HTTPException(413, { message: 'Files must be 25 MB or smaller' });
  }
  if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
    throw new HTTPException(400, { message: 'Only JPEG, PNG, GIF, WebP and PDF files are accepted' });
  }

  const { count } = (await c.env.DB.prepare(
    'SELECT COUNT(*) AS count FROM matter_attachments WHERE matter_id = ?1',
  )
    .bind(matter.id)
    .first<{ count: number }>()) ?? { count: 0 };

  const attachmentId = crypto.randomUUID();
  // Key includes the firm so a bucket listing can never leak across tenants.
  const storageKey = `firms/${matter.firm_id}/matters/${matter.id}/${attachmentId}`;

  await requireStorage(c.env).put(storageKey, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  await c.env.DB.prepare(
    `INSERT INTO matter_attachments
      (id, matter_id, document_type, file_name, storage_key, content_type, size_bytes,
       annexure_label, annexure_number, sort_order, uploaded_by)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`,
  )
    .bind(
      attachmentId, matter.id, documentType, file.name, storageKey, file.type, file.size,
      annexureLabel(count), count + 1, count, c.get('user').id,
    )
    .run();

  await audit(c, {
    action: 'attachment.upload',
    entity: 'matter_attachments',
    entity_id: attachmentId,
    matter_id: matter.id,
    detail: `${documentType}: ${file.name}`,
  });

  const created = await c.env.DB.prepare('SELECT * FROM matter_attachments WHERE id = ?1')
    .bind(attachmentId)
    .first<MatterAttachment>();

  return c.json({ attachment: created }, 201);
});

/** Streams the stored file back. Ownership is checked before R2 is ever touched. */
attachmentRoutes.get('/:matterId/attachments/:id/file', async (c) => {
  const matter = await loadOwnedMatter<Matter>(c, c.req.param('matterId'));
  const attachment = await c.env.DB.prepare(
    'SELECT * FROM matter_attachments WHERE id = ?1 AND matter_id = ?2',
  )
    .bind(c.req.param('id'), matter.id)
    .first<MatterAttachment>();

  if (!attachment) throw new HTTPException(404, { message: 'Attachment not found' });

  const object = await requireStorage(c.env).get(attachment.storage_key);
  if (!object) throw new HTTPException(404, { message: 'Stored file is missing' });

  return new Response(object.body, {
    headers: {
      'Content-Type': attachment.content_type || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${attachment.file_name.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});

attachmentRoutes.delete('/:matterId/attachments/:id', async (c) => {
  const matter = await loadOwnedMatter<Matter>(c, c.req.param('matterId'));
  const attachment = await c.env.DB.prepare(
    'SELECT * FROM matter_attachments WHERE id = ?1 AND matter_id = ?2',
  )
    .bind(c.req.param('id'), matter.id)
    .first<MatterAttachment>();

  if (!attachment) throw new HTTPException(404, { message: 'Attachment not found' });

  await requireStorage(c.env).delete(attachment.storage_key);
  await c.env.DB.prepare('DELETE FROM matter_attachments WHERE id = ?1')
    .bind(attachment.id)
    .run();

  await audit(c, {
    action: 'attachment.delete',
    entity: 'matter_attachments',
    entity_id: attachment.id,
    matter_id: matter.id,
    detail: attachment.file_name,
  });

  return c.json({ ok: true });
});

/** Reorders annexures and reassigns their letters, matching the Annexure Manager. */
attachmentRoutes.post('/:matterId/attachments/reorder', async (c) => {
  const matter = await loadOwnedMatter<Matter>(c, c.req.param('matterId'));
  const body = await c.req.json<{ ids: string[] }>().catch(() => ({ ids: [] }));

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM matter_attachments WHERE matter_id = ?1',
  )
    .bind(matter.id)
    .all<MatterAttachment>();

  const byId = new Map(results.map((row) => [row.id, row]));
  const ordered = body.ids.map((id) => byId.get(id)).filter((row): row is MatterAttachment => !!row);
  if (ordered.length !== results.length) {
    throw new HTTPException(400, { message: 'The reorder list must include every annexure exactly once' });
  }

  const updates = renumberAnnexures(ordered);
  await c.env.DB.batch(
    updates.map((update) =>
      c.env.DB.prepare(
        'UPDATE matter_attachments SET sort_order = ?1, annexure_label = ?2, annexure_number = ?3 WHERE id = ?4',
      ).bind(update.sort_order, update.annexure_label, update.annexure_number, update.id),
    ),
  );

  await audit(c, {
    action: 'attachment.reorder',
    entity: 'matter_attachments',
    matter_id: matter.id,
    detail: `${updates.length} annexures renumbered`,
  });

  return c.json({ updated: updates.length });
});

/** Runs Claude vision over one attachment and records the extracted fields. */
attachmentRoutes.post('/:matterId/attachments/:id/extract', async (c) => {
  // Authorise before anything else. Checking configuration first would answer a
  // cross-firm request with 503 instead of 404, telling the caller their request
  // got past the ownership check.
  const matter = await loadOwnedMatter<Matter>(c, c.req.param('matterId'));
  const attachment = await c.env.DB.prepare(
    'SELECT * FROM matter_attachments WHERE id = ?1 AND matter_id = ?2',
  )
    .bind(c.req.param('id'), matter.id)
    .first<MatterAttachment>();

  if (!attachment) throw new HTTPException(404, { message: 'Attachment not found' });

  if (!c.env.ANTHROPIC_API_KEY) {
    throw new HTTPException(503, { message: 'Document extraction is not configured' });
  }

  const party = c.req.query('party') === 'defendant' ? 'defendant'
    : c.req.query('party') === 'plaintiff' ? 'plaintiff'
    : null;

  const object = await requireStorage(c.env).get(attachment.storage_key);
  if (!object) throw new HTTPException(404, { message: 'Stored file is missing' });

  const bytes = new Uint8Array(await object.arrayBuffer());
  const result = await extractDocument(
    c.env.ANTHROPIC_API_KEY,
    bytes,
    attachment.content_type,
    attachment.document_type,
  );

  await c.env.DB.prepare(
    `UPDATE matter_attachments
     SET ocr_text = ?1, ocr_confidence = ?2, ocr_extracted = 1
     WHERE id = ?3`,
  )
    .bind(result.raw_text, result.overall_confidence, attachment.id)
    .run();

  // Store every field as a pending override the attorney confirms on Review & Confirm.
  const rows = result.fields
    .map((field) => ({ ...field, column: mapFieldToColumn(field.field, party) }))
    .filter((row) => row.column !== null);

  if (rows.length > 0) {
    await c.env.DB.batch(
      rows.map((row) =>
        c.env.DB.prepare(
          `INSERT INTO ocr_field_overrides
            (id, matter_id, attachment_id, field_name, extracted_value, value, confidence, confirmed, overridden)
           VALUES (?1,?2,?3,?4,?5,?5,?6,0,0)
           ON CONFLICT(matter_id, field_name) DO UPDATE SET
             attachment_id = excluded.attachment_id,
             extracted_value = excluded.extracted_value,
             value = excluded.value,
             confidence = excluded.confidence,
             confirmed = 0,
             updated_at = datetime('now')`,
        ).bind(
          crypto.randomUUID(), matter.id, attachment.id, row.column!,
          row.value, row.confidence,
        ),
      ),
    );
  }

  await audit(c, {
    action: 'attachment.extract',
    entity: 'matter_attachments',
    entity_id: attachment.id,
    matter_id: matter.id,
    detail: `${rows.length} fields at ${Math.round(result.overall_confidence * 100)}% confidence`,
  });

  return c.json({
    extraction: result,
    applied_fields: rows.map((row) => ({
      field: row.column,
      value: row.value,
      confidence: row.confidence,
    })),
  });
});
