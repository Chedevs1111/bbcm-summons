import type { AppContext } from './context.js';
import { clientIp } from './context.js';

/**
 * Appends an audit entry.
 *
 * The original schema had an audit_trail table that was never written to — the Admin
 * panel showed "Audit Trail 0". Every mutating handler here calls this.
 */
export async function audit(
  c: AppContext,
  entry: {
    action: string;
    entity: string;
    entity_id?: string | null;
    matter_id?: string | null;
    detail?: string;
    firm_id?: string | null;
  },
): Promise<void> {
  const user = c.get('user');
  try {
    await c.env.DB.prepare(
      `INSERT INTO audit_trail (id, firm_id, user_id, matter_id, action, entity, entity_id, detail, ip)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    )
      .bind(
        crypto.randomUUID(),
        entry.firm_id ?? user?.firm_id ?? null,
        user?.id ?? null,
        entry.matter_id ?? null,
        entry.action,
        entry.entity,
        entry.entity_id ?? null,
        entry.detail ?? '',
        clientIp(c),
      )
      .run();
  } catch {
    // An audit write must never take down the request it is recording.
  }
}
