import {
  branchSchema,
  createUserSchema,
  registerFirmSchema,
  templateSchema,
  type AppUser,
  type AuditEntry,
  type Branch,
  type ClauseLibraryEntry,
  type FirmTemplate,
  type LawFirm,
} from '@bbcm/schema';
import { STARTER_TEMPLATES, SYSTEM_CLAUSES } from '@bbcm/documents';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { hashPassword, isSuperAdmin } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { firmScope, requireAuth, requireRole, type Env, type Variables } from '../lib/context.js';
import { publicUser } from './auth.js';

export const adminRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
adminRoutes.use('*', requireAuth, requireRole('super_admin', 'firm_admin'));

/**
 * Firms list.
 *
 * A firm_admin sees only their own firm — the original app exposed all eight firms
 * and their contact details to anyone who opened the page.
 */
adminRoutes.get('/firms', async (c) => {
  const user = c.get('user');
  const { results } = isSuperAdmin(user)
    ? await c.env.DB.prepare('SELECT * FROM law_firms ORDER BY name').all<LawFirm>()
    : await c.env.DB.prepare('SELECT * FROM law_firms WHERE id = ?1')
        .bind(user.firm_id)
        .all<LawFirm>();

  const counts = await c.env.DB.prepare(
    `SELECT f.id,
            (SELECT COUNT(*) FROM branches b WHERE b.firm_id = f.id) AS branches,
            (SELECT COUNT(*) FROM app_users u WHERE u.firm_id = f.id) AS users,
            (SELECT COUNT(*) FROM firm_templates t WHERE t.firm_id = f.id) AS templates
     FROM law_firms f`,
  ).all<{ id: string; branches: number; users: number; templates: number }>();

  const byId = new Map(counts.results.map((row) => [row.id, row]));

  return c.json({
    firms: results.map((firm) => ({
      ...firm,
      counts: byId.get(firm.id) ?? { branches: 0, users: 0, templates: 0 },
    })),
  });
});

/** Only a super_admin may register a new firm — a firm_admin cannot create tenants. */
adminRoutes.post('/firms', requireRole('super_admin'), async (c) => {
  const parsed = registerFirmSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
  }

  const firmId = crypto.randomUUID();
  const d = parsed.data;

  await c.env.DB.prepare(
    `INSERT INTO law_firms (id, name, province, city, phone, email, address, registration_number, lpc_number, vat_number)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`,
  )
    .bind(
      firmId, d.name, d.province, d.city, d.phone, d.email, d.address,
      d.registration_number, d.lpc_number, d.vat_number,
    )
    .run();

  // Seed the eight starter templates so a new firm can generate documents immediately.
  await c.env.DB.batch(
    STARTER_TEMPLATES.map((template) =>
      c.env.DB.prepare(
        `INSERT INTO firm_templates
          (id, firm_id, name, document_type, marriage_regime, is_contested, has_children, body, is_active, is_default)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,1,?9)`,
      ).bind(
        crypto.randomUUID(), firmId, template.name, template.document_type,
        template.marriage_regime,
        template.is_contested === null ? null : template.is_contested ? 1 : 0,
        template.has_children === null ? null : template.has_children ? 1 : 0,
        template.body, template.is_default ? 1 : 0,
      ),
    ),
  );

  await audit(c, {
    action: 'firm.create',
    entity: 'law_firms',
    entity_id: firmId,
    firm_id: firmId,
    detail: d.name,
  });

  const firm = await c.env.DB.prepare('SELECT * FROM law_firms WHERE id = ?1')
    .bind(firmId)
    .first<LawFirm>();

  return c.json({ firm }, 201);
});

adminRoutes.get('/branches', async (c) => {
  const firmId = firmScope(c);
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM branches WHERE firm_id = ?1 ORDER BY name',
  )
    .bind(firmId)
    .all<Branch>();
  return c.json({ branches: results });
});

adminRoutes.post('/branches', async (c) => {
  const firmId = firmScope(c);
  const parsed = branchSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
  }

  const branchId = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO branches (id, firm_id, name, city, address, phone) VALUES (?1,?2,?3,?4,?5,?6)',
  )
    .bind(branchId, firmId, parsed.data.name, parsed.data.city, parsed.data.address, parsed.data.phone)
    .run();

  await audit(c, {
    action: 'branch.create',
    entity: 'branches',
    entity_id: branchId,
    detail: parsed.data.name,
  });

  return c.json({ branch: { id: branchId, firm_id: firmId, ...parsed.data } }, 201);
});

adminRoutes.get('/users', async (c) => {
  const firmId = firmScope(c);
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM app_users WHERE firm_id = ?1 ORDER BY full_name',
  )
    .bind(firmId)
    .all<AppUser>();
  return c.json({ users: results.map(publicUser) });
});

adminRoutes.post('/users', async (c) => {
  const firmId = firmScope(c);
  const parsed = createUserSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
  }

  // Only a super_admin can mint another super_admin.
  if (parsed.data.role === 'super_admin' && !isSuperAdmin(c.get('user'))) {
    throw new HTTPException(403, { message: 'Only a super admin can create a super admin' });
  }

  const existing = await c.env.DB.prepare('SELECT id FROM app_users WHERE email = ?1')
    .bind(parsed.data.email)
    .first();
  if (existing) throw new HTTPException(409, { message: 'That email address is already registered' });

  const userId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO app_users (id, firm_id, branch_id, full_name, email, phone, role, lpc_number, password_hash)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`,
  )
    .bind(
      userId, firmId, parsed.data.branch_id ?? null, parsed.data.full_name, parsed.data.email,
      parsed.data.phone, parsed.data.role, parsed.data.lpc_number,
      await hashPassword(parsed.data.password),
    )
    .run();

  await audit(c, {
    action: 'user.create',
    entity: 'app_users',
    entity_id: userId,
    detail: `${parsed.data.email} (${parsed.data.role})`,
  });

  return c.json({ user: { id: userId, firm_id: firmId, ...parsed.data, password: undefined } }, 201);
});

adminRoutes.get('/templates', async (c) => {
  const firmId = firmScope(c);
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM firm_templates WHERE firm_id = ?1 ORDER BY document_type, name',
  )
    .bind(firmId)
    .all<FirmTemplate>();
  return c.json({ templates: results });
});

adminRoutes.post('/templates', async (c) => {
  const firmId = firmScope(c);
  const parsed = templateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
  }

  const templateId = crypto.randomUUID();
  const d = parsed.data;
  await c.env.DB.prepare(
    `INSERT INTO firm_templates
      (id, firm_id, name, document_type, marriage_regime, is_contested, has_children, body, is_active, is_default)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`,
  )
    .bind(
      templateId, firmId, d.name, d.document_type, d.marriage_regime ?? null,
      d.is_contested === null || d.is_contested === undefined ? null : d.is_contested ? 1 : 0,
      d.has_children === null || d.has_children === undefined ? null : d.has_children ? 1 : 0,
      d.body, d.is_active ? 1 : 0, d.is_default ? 1 : 0,
    )
    .run();

  await audit(c, {
    action: 'template.create',
    entity: 'firm_templates',
    entity_id: templateId,
    detail: d.name,
  });

  return c.json({ template: { id: templateId, firm_id: firmId, ...d } }, 201);
});

adminRoutes.put('/templates/:id', async (c) => {
  const firmId = firmScope(c);
  const parsed = templateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
  }

  const d = parsed.data;
  const result = await c.env.DB.prepare(
    `UPDATE firm_templates
     SET name = ?1, document_type = ?2, marriage_regime = ?3, is_contested = ?4,
         has_children = ?5, body = ?6, is_active = ?7, is_default = ?8, updated_at = datetime('now')
     WHERE id = ?9 AND firm_id = ?10`,
  )
    .bind(
      d.name, d.document_type, d.marriage_regime ?? null,
      d.is_contested === null || d.is_contested === undefined ? null : d.is_contested ? 1 : 0,
      d.has_children === null || d.has_children === undefined ? null : d.has_children ? 1 : 0,
      d.body, d.is_active ? 1 : 0, d.is_default ? 1 : 0,
      c.req.param('id'), firmId,
    )
    .run();

  if (result.meta.changes === 0) throw new HTTPException(404, { message: 'Template not found' });

  await audit(c, {
    action: 'template.update',
    entity: 'firm_templates',
    entity_id: c.req.param('id'),
    detail: d.name,
  });

  return c.json({ ok: true });
});

adminRoutes.delete('/templates/:id', async (c) => {
  const firmId = firmScope(c);
  const result = await c.env.DB.prepare(
    'DELETE FROM firm_templates WHERE id = ?1 AND firm_id = ?2',
  )
    .bind(c.req.param('id'), firmId)
    .run();

  if (result.meta.changes === 0) throw new HTTPException(404, { message: 'Template not found' });

  await audit(c, {
    action: 'template.delete',
    entity: 'firm_templates',
    entity_id: c.req.param('id'),
  });

  return c.json({ ok: true });
});

adminRoutes.get('/clauses', async (c) => {
  const firmId = firmScope(c);
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM clause_library WHERE firm_id IS NULL OR firm_id = ?1 ORDER BY sort_order',
  )
    .bind(firmId)
    .all<ClauseLibraryEntry>();
  return c.json({ clauses: results, system_clause_count: SYSTEM_CLAUSES.length });
});

adminRoutes.get('/audit', async (c) => {
  const firmId = firmScope(c);
  const { results } = await c.env.DB.prepare(
    `SELECT a.*, u.full_name AS user_name
     FROM audit_trail a LEFT JOIN app_users u ON u.id = a.user_id
     WHERE a.firm_id = ?1
     ORDER BY a.created_at DESC LIMIT 200`,
  )
    .bind(firmId)
    .all<AuditEntry & { user_name: string | null }>();
  return c.json({ entries: results });
});
