import {
  HIGH_COURT_DIVISIONS,
  PROVINCES,
  REGIONAL_COURTS,
  type Branch,
  type LawFirm,
} from '@bbcm/schema';
import { Hono } from 'hono';
import { firmScope, requireAuth, type Env, type Variables } from '../lib/context.js';

export const lookupRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
lookupRoutes.use('*', requireAuth);

/**
 * Everything the New Matter wizard needs to populate its selects.
 *
 * Scoped to the caller's firm: an attorney sees their own firm's branches and
 * colleagues, never the full multi-tenant list the original app exposed.
 */
lookupRoutes.get('/', async (c) => {
  const firmId = firmScope(c);

  const [firm, branches, attorneys] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM law_firms WHERE id = ?1').bind(firmId).first<LawFirm>(),
    c.env.DB.prepare('SELECT * FROM branches WHERE firm_id = ?1 ORDER BY name')
      .bind(firmId)
      .all<Branch>(),
    c.env.DB.prepare(
      `SELECT id, full_name, role, lpc_number FROM app_users
       WHERE firm_id = ?1 AND is_active = 1
         AND role IN ('attorney', 'candidate_attorney', 'firm_admin', 'super_admin')
       ORDER BY full_name`,
    )
      .bind(firmId)
      .all<{ id: string; full_name: string; role: string; lpc_number: string }>(),
  ]);

  return c.json({
    firm,
    branches: branches.results,
    attorneys: attorneys.results,
    provinces: PROVINCES,
    courts: { high_court: HIGH_COURT_DIVISIONS, regional_court: REGIONAL_COURTS },
  });
});
