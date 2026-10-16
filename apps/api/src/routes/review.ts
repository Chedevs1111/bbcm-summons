import { ocrOverrideSchema, type Matter, type OcrFieldOverride } from '@bbcm/schema';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { audit } from '../lib/audit.js';
import { loadOwnedMatter, requireAuth, type Env, type Variables } from '../lib/context.js';

export const reviewRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
reviewRoutes.use('*', requireAuth);

/** Backs Review & Confirm and Detailed OCR. */
reviewRoutes.get('/:matterId/review', async (c) => {
  const matter = await loadOwnedMatter<Matter>(c, c.req.param('matterId'));
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM ocr_field_overrides WHERE matter_id = ?1 ORDER BY field_name',
  )
    .bind(matter.id)
    .all<OcrFieldOverride>();

  const confident = results.filter((row) => row.confidence >= 0.8).length;
  const needsReview = results.filter((row) => row.confidence < 0.8 && row.confirmed === 0).length;

  return c.json({
    fields: results,
    summary: {
      total: results.length,
      confirmed: results.filter((row) => row.confirmed === 1).length,
      high_confidence: confident,
      needs_review: needsReview,
    },
  });
});

/** Confirms or overrides a single extracted field. */
reviewRoutes.patch('/:matterId/review/:field', async (c) => {
  const matter = await loadOwnedMatter<Matter>(c, c.req.param('matterId'));
  const fieldName = c.req.param('field');

  const parsed = ocrOverrideSchema
    .omit({ field_name: true })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? 'Invalid input' });
  }

  const existing = await c.env.DB.prepare(
    'SELECT * FROM ocr_field_overrides WHERE matter_id = ?1 AND field_name = ?2',
  )
    .bind(matter.id, fieldName)
    .first<OcrFieldOverride>();

  if (!existing) throw new HTTPException(404, { message: 'No extracted value for that field' });

  const overridden = parsed.data.value !== existing.extracted_value ? 1 : 0;

  await c.env.DB.prepare(
    `UPDATE ocr_field_overrides
     SET value = ?1, confirmed = ?2, overridden = ?3, updated_at = datetime('now')
     WHERE id = ?4`,
  )
    .bind(parsed.data.value, parsed.data.confirmed ? 1 : 0, overridden, existing.id)
    .run();

  await audit(c, {
    action: overridden ? 'review.override' : 'review.confirm',
    entity: 'ocr_field_overrides',
    entity_id: existing.id,
    matter_id: matter.id,
    detail: fieldName,
  });

  return c.json({ ok: true, overridden: overridden === 1 });
});

/**
 * Writes confirmed extracted values onto the matter itself.
 *
 * Only confirmed fields are applied — an unreviewed extraction never reaches a
 * court document.
 */
reviewRoutes.post('/:matterId/review/apply', async (c) => {
  const matter = await loadOwnedMatter<Matter>(c, c.req.param('matterId'));

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM ocr_field_overrides WHERE matter_id = ?1 AND confirmed = 1',
  )
    .bind(matter.id)
    .all<OcrFieldOverride>();

  if (results.length === 0) {
    throw new HTTPException(422, { message: 'Confirm at least one field before applying' });
  }

  // Only columns that actually exist on `matters` may be written.
  const writable = new Set(Object.keys(matter));
  const applicable = results.filter((row) => writable.has(row.field_name) && row.field_name !== 'id');

  if (applicable.length > 0) {
    const assignments = applicable.map((row, i) => `${row.field_name} = ?${i + 1}`).join(', ');
    await c.env.DB.prepare(
      `UPDATE matters SET ${assignments}, ocr_data_applied = 1, updated_at = datetime('now')
       WHERE id = ?${applicable.length + 1}`,
    )
      .bind(...applicable.map((row) => row.value), matter.id)
      .run();
  }

  await audit(c, {
    action: 'review.apply',
    entity: 'matters',
    entity_id: matter.id,
    matter_id: matter.id,
    detail: `${applicable.length} fields applied`,
  });

  return c.json({ applied: applicable.length, skipped: results.length - applicable.length });
});
