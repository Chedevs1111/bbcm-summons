import {
  assetSchema,
  childSchema,
  liabilitySchema,
  matterInputSchema,
  matterUpdateSchema,
  type Matter,
  type MatterAsset,
  type MatterChild,
  type MatterLiability,
} from '@bbcm/schema';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { audit } from '../lib/audit.js';
import {
  firmScope,
  loadOwnedMatter,
  requireAuth,
  type Env,
  type Variables,
} from '../lib/context.js';
import { expandMatterRow, flattenMatterInput } from '../lib/matters.js';

export const matterRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
matterRoutes.use('*', requireAuth);

/** Column allow-list — nothing outside this set can be written by a client. */
const WRITABLE_COLUMNS = new Set([
  'branch_id', 'attorney_id', 'case_reference', 'case_number', 'province', 'court_type',
  'court_name', 'is_contested', 'status',
  'marriage_date', 'marriage_place', 'marriage_type', 'marriage_regime',
  'marriage_certificate_attached', 'marriage_certificate_annexure_ref',
  'child_maintenance_claimed', 'spousal_maintenance_claimed', 'pension_interest_claimed',
  'forfeiture_claimed', 'costs_sought',
  ...['plaintiff', 'defendant'].flatMap((side) =>
    [
      'full_names', 'surname', 'id_number', 'passport', 'dob', 'gender', 'occupation',
      'employer', 'employee_number', 'income', 'monthly_expenses', 'physical_address',
      'postal_address', 'phone', 'email', 'pension_fund_name', 'pension_share_pct',
    ].map((field) => `${side}_${field}`),
  ),
]);

matterRoutes.get('/', async (c) => {
  const firmId = firmScope(c);
  const search = (c.req.query('search') ?? '').trim();
  const status = c.req.query('status') ?? '';
  const sort = c.req.query('sort') ?? 'newest';

  const orderBy =
    sort === 'oldest' ? 'created_at ASC'
    : sort === 'name' ? 'plaintiff_surname ASC, plaintiff_full_names ASC'
    : sort === 'status' ? 'status ASC, created_at DESC'
    : 'created_at DESC';

  const filters = ['firm_id = ?1'];
  const bindings: unknown[] = [firmId];

  if (status) {
    bindings.push(status);
    filters.push(`status = ?${bindings.length}`);
  }
  if (search) {
    bindings.push(`%${search.toLowerCase()}%`);
    const p = `?${bindings.length}`;
    filters.push(
      `(lower(plaintiff_full_names) LIKE ${p} OR lower(plaintiff_surname) LIKE ${p}
        OR lower(defendant_full_names) LIKE ${p} OR lower(defendant_surname) LIKE ${p}
        OR lower(case_reference) LIKE ${p} OR lower(case_number) LIKE ${p})`,
    );
  }

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM matters WHERE ${filters.join(' AND ')} ORDER BY ${orderBy} LIMIT 200`,
  )
    .bind(...bindings)
    .all<Matter>();

  const counts = await c.env.DB.prepare(
    'SELECT status, COUNT(*) AS n FROM matters WHERE firm_id = ?1 GROUP BY status',
  )
    .bind(firmId)
    .all<{ status: string; n: number }>();

  const byStatus = Object.fromEntries(counts.results.map((row) => [row.status, row.n]));

  return c.json({
    matters: results,
    stats: {
      total: Object.values(byStatus).reduce((sum, n) => sum + n, 0),
      active: byStatus['active'] ?? 0,
      review: byStatus['review'] ?? 0,
      complete: (byStatus['generated'] ?? 0) + (byStatus['archived'] ?? 0),
    },
  });
});

matterRoutes.post('/', async (c) => {
  const parsed = matterInputSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
  }

  const firmId = firmScope(c);
  const matterId = crypto.randomUUID();
  const row = flattenMatterInput(parsed.data);

  // firm_id always comes from the session, never from the request body.
  const columns = ['id', 'firm_id', ...Object.keys(row).filter((k) => WRITABLE_COLUMNS.has(k))];
  const values = [matterId, firmId, ...columns.slice(2).map((k) => row[k] as never)];
  const placeholders = columns.map((_, i) => `?${i + 1}`).join(', ');

  await c.env.DB.prepare(
    `INSERT INTO matters (${columns.join(', ')}) VALUES (${placeholders})`,
  )
    .bind(...values)
    .run();

  await replaceChildren(c, matterId, parsed.data.children ?? []);
  await replaceAssets(c, matterId, parsed.data.assets ?? []);
  await replaceLiabilities(c, matterId, parsed.data.liabilities ?? []);

  await audit(c, {
    action: 'matter.create',
    entity: 'matters',
    entity_id: matterId,
    matter_id: matterId,
    detail: parsed.data.case_reference ?? '',
  });

  const created = await c.env.DB.prepare('SELECT * FROM matters WHERE id = ?1')
    .bind(matterId)
    .first<Matter>();

  return c.json({ matter: created ? expandMatterRow(created) : null }, 201);
});

matterRoutes.get('/:id', async (c) => {
  const matter = await loadOwnedMatter<Matter>(c, c.req.param('id'));
  const [children, assets, liabilities, attachments, documents] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM matter_children WHERE matter_id = ?1 ORDER BY sort_order')
      .bind(matter.id).all<MatterChild>(),
    c.env.DB.prepare('SELECT * FROM matter_assets WHERE matter_id = ?1 ORDER BY sort_order')
      .bind(matter.id).all<MatterAsset>(),
    c.env.DB.prepare('SELECT * FROM matter_liabilities WHERE matter_id = ?1 ORDER BY sort_order')
      .bind(matter.id).all<MatterLiability>(),
    c.env.DB.prepare('SELECT * FROM matter_attachments WHERE matter_id = ?1 ORDER BY sort_order')
      .bind(matter.id).all(),
    c.env.DB.prepare(
      'SELECT id, document_type, title, version, created_at FROM generated_documents WHERE matter_id = ?1 ORDER BY created_at DESC',
    ).bind(matter.id).all(),
  ]);

  return c.json({
    matter: expandMatterRow(matter),
    children: children.results,
    assets: assets.results,
    liabilities: liabilities.results,
    attachments: attachments.results,
    documents: documents.results,
  });
});

matterRoutes.patch('/:id', async (c) => {
  const existing = await loadOwnedMatter<Matter>(c, c.req.param('id'));
  const parsed = matterUpdateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
  }

  const row = flattenMatterInput(parsed.data);
  const columns = Object.keys(row).filter((k) => WRITABLE_COLUMNS.has(k));

  if (columns.length > 0) {
    const assignments = columns.map((col, i) => `${col} = ?${i + 1}`).join(', ');
    await c.env.DB.prepare(
      `UPDATE matters SET ${assignments}, updated_at = datetime('now') WHERE id = ?${columns.length + 1}`,
    )
      .bind(...columns.map((col) => row[col] as never), existing.id)
      .run();
  }

  if (parsed.data.children) await replaceChildren(c, existing.id, parsed.data.children);
  if (parsed.data.assets) await replaceAssets(c, existing.id, parsed.data.assets);
  if (parsed.data.liabilities) await replaceLiabilities(c, existing.id, parsed.data.liabilities);

  await audit(c, {
    action: 'matter.update',
    entity: 'matters',
    entity_id: existing.id,
    matter_id: existing.id,
    detail: columns.join(','),
  });

  const updated = await c.env.DB.prepare('SELECT * FROM matters WHERE id = ?1')
    .bind(existing.id)
    .first<Matter>();

  return c.json({ matter: updated ? expandMatterRow(updated) : null });
});

matterRoutes.delete('/:id', async (c) => {
  const matter = await loadOwnedMatter<Matter>(c, c.req.param('id'));

  // Remove the stored files too — an orphaned R2 object still holds personal information.
  const { results } = await c.env.DB.prepare(
    'SELECT storage_key FROM matter_attachments WHERE matter_id = ?1',
  )
    .bind(matter.id)
    .all<{ storage_key: string }>();
  // Best effort: a matter must still delete on a deployment with no storage, or rows
  // would be orphaned by an outage of something the delete does not depend on.
  if (c.env.DOCUMENTS) {
    const storage = c.env.DOCUMENTS;
    await Promise.all(results.map((row) => storage.delete(row.storage_key)));
  }

  await c.env.DB.prepare('DELETE FROM matters WHERE id = ?1').bind(matter.id).run();

  await audit(c, {
    action: 'matter.delete',
    entity: 'matters',
    entity_id: matter.id,
    detail: matter.case_reference,
  });

  return c.json({ ok: true });
});

async function replaceChildren(
  c: { env: Env },
  matterId: string,
  children: Array<Record<string, unknown>>,
) {
  const parsed = children.map((child) => childSchema.parse(child));
  await c.env.DB.prepare('DELETE FROM matter_children WHERE matter_id = ?1').bind(matterId).run();
  if (parsed.length === 0) return;

  const statements = parsed.map((child, index) =>
    c.env.DB.prepare(
      `INSERT INTO matter_children
        (id, matter_id, full_name, surname, id_number, dob, gender, birth_cert_attached, maintenance_claimed, sort_order)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`,
    ).bind(
      crypto.randomUUID(), matterId, child.full_name, child.surname, child.id_number,
      child.dob, child.gender ?? '', child.birth_cert_attached ? 1 : 0,
      child.maintenance_claimed, index,
    ),
  );
  await c.env.DB.batch(statements);
}

async function replaceAssets(
  c: { env: Env },
  matterId: string,
  assets: Array<Record<string, unknown>>,
) {
  const parsed = assets.map((asset) => assetSchema.parse(asset));
  await c.env.DB.prepare('DELETE FROM matter_assets WHERE matter_id = ?1').bind(matterId).run();
  if (parsed.length === 0) return;

  const statements = parsed.map((asset, index) =>
    c.env.DB.prepare(
      `INSERT INTO matter_assets
        (id, matter_id, description, category, value, allocated_to, commencement_value, notes, sort_order)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`,
    ).bind(
      crypto.randomUUID(), matterId, asset.description, asset.category, asset.value,
      asset.allocated_to, asset.commencement_value, asset.notes, index,
    ),
  );
  await c.env.DB.batch(statements);
}

async function replaceLiabilities(
  c: { env: Env },
  matterId: string,
  liabilities: Array<Record<string, unknown>>,
) {
  const parsed = liabilities.map((liability) => liabilitySchema.parse(liability));
  await c.env.DB.prepare('DELETE FROM matter_liabilities WHERE matter_id = ?1')
    .bind(matterId)
    .run();
  if (parsed.length === 0) return;

  const statements = parsed.map((liability, index) =>
    c.env.DB.prepare(
      `INSERT INTO matter_liabilities
        (id, matter_id, description, creditor, amount, responsible_party, sort_order)
       VALUES (?1,?2,?3,?4,?5,?6,?7)`,
    ).bind(
      crypto.randomUUID(), matterId, liability.description, liability.creditor,
      liability.amount, liability.responsible_party, index,
    ),
  );
  await c.env.DB.batch(statements);
}
