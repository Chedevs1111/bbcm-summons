/**
 * Client portal.
 *
 * Gives one client read access to one matter without creating a user account, so they
 * can check status and send documents in instead of phoning the attorney.
 *
 * Security shape:
 *   - the token is 256 bits of randomness, stored only as a SHA-256 hash, so a
 *     database read cannot be replayed as portal access
 *   - the plaintext token is returned exactly once, at creation
 *   - every response is assembled field by field from the matter; the matter row is
 *     never spread into the response, so a new column cannot leak by accident
 *   - the portal never exposes pleadings, fee notes, the audit trail, other matters,
 *     or anything belonging to the opposing party
 */

import { portalInviteSchema, type Matter, type PortalInvite } from '@bbcm/schema';
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  MATTER_STATUS_LABELS,
  type DocumentType,
  type MatterAttachment,
  type ServiceEvent,
} from '@bbcm/schema';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { audit } from '../lib/audit.js';
import { requireStorage, loadOwnedMatter, requireAuth, type Env, type Variables } from '../lib/context.js';
import { LIMITS, callerKey, hitRateLimit } from '../lib/rateLimit.js';

/** Attorney-facing invite management. Mounted under the authenticated matter routes. */
export const portalAdminRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
portalAdminRoutes.use('*', requireAuth);

/** Client-facing redemption. Deliberately has no auth middleware. */
export const portalPublicRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function publicInvite(invite: PortalInvite) {
  const { token_hash: _omit, ...rest } = invite;
  return rest;
}

// ---------------------------------------------------------------------------
// Attorney side
// ---------------------------------------------------------------------------

portalAdminRoutes.get('/:matterId/portal-invites', async (c) => {
  const matter = await loadOwnedMatter<Matter>(c, c.req.param('matterId'));
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM portal_invites WHERE matter_id = ?1 ORDER BY created_at DESC',
  )
    .bind(matter.id)
    .all<PortalInvite>();
  return c.json({ invites: results.map(publicInvite) });
});

portalAdminRoutes.post('/:matterId/portal-invites', async (c) => {
  const matter = await loadOwnedMatter<Matter>(c, c.req.param('matterId'));
  const parsed = portalInviteSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
  }

  const data = parsed.data;
  const token = newToken();
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + data.expires_in_days * 86_400_000).toISOString();

  await c.env.DB.prepare(
    `INSERT INTO portal_invites
      (id, matter_id, token_hash, party, label, expires_at, can_upload, created_by)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`,
  )
    .bind(
      id, matter.id, await hashToken(token), data.party, data.label, expiresAt,
      data.can_upload ? 1 : 0, c.get('user').id,
    )
    .run();

  await audit(c, {
    action: 'portal.invite',
    entity: 'portal_invites',
    entity_id: id,
    matter_id: matter.id,
    detail: `${data.party}, expires ${expiresAt.slice(0, 10)}`,
  });

  // The only time the plaintext token exists outside the client's link. It is not
  // emailed from here: the attorney sends it through whatever channel they already
  // use with that client, and nothing in this system stores it.
  return c.json({ id, token, expires_at: expiresAt, path: `/portal/${token}` }, 201);
});

portalAdminRoutes.delete('/:matterId/portal-invites/:id', async (c) => {
  const matter = await loadOwnedMatter<Matter>(c, c.req.param('matterId'));
  const result = await c.env.DB.prepare(
    `UPDATE portal_invites SET revoked_at = datetime('now')
     WHERE id = ?1 AND matter_id = ?2 AND revoked_at IS NULL`,
  )
    .bind(c.req.param('id'), matter.id)
    .run();

  if (result.meta.changes === 0) {
    throw new HTTPException(404, { message: 'Invite not found, or already revoked' });
  }

  await audit(c, {
    action: 'portal.revoke',
    entity: 'portal_invites',
    entity_id: c.req.param('id'),
    matter_id: matter.id,
  });

  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Client side
// ---------------------------------------------------------------------------

interface Redeemed {
  invite: PortalInvite;
  matter: Matter;
}

/**
 * Resolves a token to an invite and its matter.
 *
 * Every failure — unknown, revoked, expired — returns the same 404, so the endpoint
 * cannot be used to learn whether a token ever existed.
 */
async function redeem(env: Env, token: string): Promise<Redeemed> {
  const notFound = new HTTPException(404, {
    message: 'This link is not valid. Ask your attorney for a new one.',
  });

  if (!/^[0-9a-f]{64}$/.test(token)) throw notFound;

  const invite = await env.DB.prepare('SELECT * FROM portal_invites WHERE token_hash = ?1')
    .bind(await hashToken(token))
    .first<PortalInvite>();

  if (!invite) throw notFound;
  if (invite.revoked_at) throw notFound;
  if (new Date(invite.expires_at).getTime() < Date.now()) throw notFound;

  const matter = await env.DB.prepare('SELECT * FROM matters WHERE id = ?1')
    .bind(invite.matter_id)
    .first<Matter>();

  if (!matter) throw notFound;

  await env.DB.prepare(
    `UPDATE portal_invites SET last_used_at = datetime('now'), use_count = use_count + 1
     WHERE id = ?1`,
  )
    .bind(invite.id)
    .run();

  return { invite, matter };
}

/** The documents a divorce matter normally needs from the client. */
const EXPECTED_DOCUMENTS: DocumentType[] = [
  'marriage_certificate',
  'id_document',
  'birth_certificate',
  'payslip',
];

portalPublicRoutes.get('/:token', async (c) => {
  const limit = await hitRateLimit(
    c.env.SESSIONS,
    `portal:read:${callerKey(c.req.raw)}`,
    LIMITS.portalRead,
  );
  if (!limit.allowed) {
    c.header('Retry-After', String(limit.retryAfter));
    throw new HTTPException(429, { message: 'Too many requests. Please wait a moment.' });
  }

  const { invite, matter } = await redeem(c.env, c.req.param('token'));

  const [firm, attachments, service] = await Promise.all([
    c.env.DB.prepare('SELECT name, phone, email FROM law_firms WHERE id = ?1')
      .bind(matter.firm_id)
      .first<{ name: string; phone: string; email: string }>(),
    c.env.DB.prepare(
      'SELECT id, document_type, file_name, created_at FROM matter_attachments WHERE matter_id = ?1 ORDER BY created_at',
    )
      .bind(matter.id)
      .all<Pick<MatterAttachment, 'id' | 'document_type' | 'file_name' | 'created_at'>>(),
    c.env.DB.prepare(
      'SELECT status, served_at FROM service_events WHERE matter_id = ?1 ORDER BY created_at DESC LIMIT 1',
    )
      .bind(matter.id)
      .first<Pick<ServiceEvent, 'status' | 'served_at'>>(),
  ]);

  const supplied = new Set(attachments.results.map((row) => row.document_type));

  // Assembled field by field. Spreading `matter` here would leak the other party's
  // ID number, income and address the first time someone adds a column.
  return c.json({
    matter: {
      reference: matter.case_reference,
      case_number: matter.case_number,
      court: matter.court_name,
      status: MATTER_STATUS_LABELS[matter.status] ?? matter.status,
      // Surnames only — enough to confirm they are looking at the right matter.
      parties: `${matter.plaintiff_surname} v ${matter.defendant_surname}`,
    },
    firm,
    can_upload: invite.can_upload === 1,
    outstanding: EXPECTED_DOCUMENTS.filter((type) => !supplied.has(type)).map((type) => ({
      type,
      label: DOCUMENT_TYPE_LABELS[type],
    })),
    uploads: attachments.results.map((row) => ({
      id: row.id,
      label: DOCUMENT_TYPE_LABELS[row.document_type] ?? row.document_type,
      file_name: row.file_name,
      uploaded_at: row.created_at,
    })),
    service: service
      ? { status: service.status, served_at: service.served_at }
      : null,
  });
});

const MAX_PORTAL_UPLOAD = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
]);

portalPublicRoutes.post('/:token/uploads', async (c) => {
  // Two limits, and the order matters. This one is keyed on the caller and runs before
  // the token is resolved, so someone spraying invented tokens is bounded by the same
  // budget as a reader rather than getting a free lookup per request.
  const byCaller = await hitRateLimit(
    c.env.SESSIONS,
    `portal:read:${callerKey(c.req.raw)}`,
    LIMITS.portalRead,
  );
  if (!byCaller.allowed) {
    c.header('Retry-After', String(byCaller.retryAfter));
    throw new HTTPException(429, { message: 'Too many requests. Please wait a moment.' });
  }

  const { invite, matter } = await redeem(c.env, c.req.param('token'));

  // The second is keyed on the invite rather than the IP: a client on a phone changes
  // address as they move, and the thing worth bounding is how much one link puts in R2.
  const limit = await hitRateLimit(
    c.env.SESSIONS,
    `portal:upload:${invite.id}`,
    LIMITS.portalUpload,
  );
  if (!limit.allowed) {
    c.header('Retry-After', String(limit.retryAfter));
    throw new HTTPException(429, {
      message: 'You have sent a lot of files. Please wait a while before sending more.',
    });
  }

  if (invite.can_upload !== 1) {
    throw new HTTPException(403, { message: 'This link does not allow uploads.' });
  }

  const form = await c.req.formData();
  const file = form.get('file');
  const documentType = String(form.get('document_type') ?? 'other') as DocumentType;

  if (!(file instanceof File)) throw new HTTPException(400, { message: 'No file was uploaded' });
  if (!DOCUMENT_TYPES.includes(documentType)) {
    throw new HTTPException(400, { message: 'Unknown document type' });
  }
  if (file.size > MAX_PORTAL_UPLOAD) {
    throw new HTTPException(413, { message: 'Files must be 15 MB or smaller' });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new HTTPException(400, { message: 'Only JPEG, PNG, WebP and PDF files are accepted' });
  }

  const attachmentId = crypto.randomUUID();
  const storageKey = `firms/${matter.firm_id}/matters/${matter.id}/${attachmentId}`;

  await requireStorage(c.env).put(storageKey, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  const { count } = (await c.env.DB.prepare(
    'SELECT COUNT(*) AS count FROM matter_attachments WHERE matter_id = ?1',
  )
    .bind(matter.id)
    .first<{ count: number }>()) ?? { count: 0 };

  await c.env.DB.prepare(
    `INSERT INTO matter_attachments
      (id, matter_id, document_type, file_name, storage_key, content_type, size_bytes,
       sort_order, uploaded_by)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`,
  )
    .bind(
      attachmentId, matter.id, documentType, file.name, storageKey, file.type, file.size,
      count, `portal:${invite.id}`,
    )
    .run();

  // Recorded without a user, since a client is not a user of the system.
  await c.env.DB.prepare(
    `INSERT INTO audit_trail (id, firm_id, user_id, matter_id, action, entity, entity_id, detail, ip)
     VALUES (?1, ?2, NULL, ?3, 'portal.upload', 'matter_attachments', ?4, ?5, ?6)`,
  )
    .bind(
      crypto.randomUUID(), matter.firm_id, matter.id, attachmentId,
      `${documentType}: ${file.name}`,
      c.req.header('CF-Connecting-IP') ?? '',
    )
    .run();

  return c.json({ ok: true, file_name: file.name }, 201);
});
