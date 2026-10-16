import type { AppUser } from '@bbcm/schema';
import type { Context, MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { SESSION_COOKIE, isSuperAdmin, parseCookies, readSession } from './auth.js';

export interface Env {
  DB: D1Database;
  /**
   * Document storage. Optional: an account without R2 enabled can still deploy and run
   * everything that does not touch a stored file. `requireStorage` turns its absence
   * into a clear 503 rather than a crash at the first `.put`.
   */
  DOCUMENTS?: R2Bucket;
  SESSIONS: KVNamespace;
  ANTHROPIC_API_KEY?: string;
  /** The built SPA, served from this same origin. */
  ASSETS: Fetcher;
  ENVIRONMENT?: string;
  /**
   * When set, the SPA is hosted on a DIFFERENT origin than this Worker (e.g. static
   * files on shared hosting). This is that origin, e.g. "https://bbcmsummons.co.za".
   * It switches on CORS for that origin and makes the session cookie SameSite=None so
   * the browser sends it on cross-origin requests. Leave unset for same-origin serving,
   * which stays SameSite=Lax with no CORS.
   */
  WEB_ORIGIN?: string;
}

export interface Variables {
  user: AppUser;
  session_id: string;
}

export type AppContext = Context<{ Bindings: Env; Variables: Variables }>;

/**
 * Resolves the session cookie to a user and puts it on the context.
 *
 * This is the gate the original app lacked entirely: without a valid session there is
 * no principal, and every downstream handler derives firm scope from the principal
 * rather than from anything the client sends.
 */
export const requireAuth: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (
  c,
  next,
) => {
  const cookies = parseCookies(c.req.header('Cookie') ?? null);
  const sessionId = cookies[SESSION_COOKIE] ?? '';
  const session = await readSession(c.env.SESSIONS, sessionId);
  if (!session) throw new HTTPException(401, { message: 'Not signed in' });

  const user = await c.env.DB.prepare(
    'SELECT * FROM app_users WHERE id = ?1 AND is_active = 1',
  )
    .bind(session.user_id)
    .first<AppUser>();

  if (!user) throw new HTTPException(401, { message: 'Session no longer valid' });

  c.set('user', user);
  c.set('session_id', sessionId);
  await next();
};

/** Restricts a route to the given roles. */
export function requireRole(
  ...roles: AppUser['role'][]
): MiddlewareHandler<{ Bindings: Env; Variables: Variables }> {
  return async (c, next) => {
    const user = c.get('user');
    if (!roles.includes(user.role)) {
      throw new HTTPException(403, { message: 'You do not have permission to do that' });
    }
    await next();
  };
}

/**
 * The firm a request is allowed to touch.
 *
 * Every query that reads or writes firm-owned data must filter on this value. A
 * super_admin may target another firm explicitly via `?firm_id=`; everyone else is
 * pinned to their own firm regardless of what the request asks for.
 */
export function firmScope(c: AppContext): string {
  const user = c.get('user');
  if (isSuperAdmin(user)) {
    const requested = c.req.query('firm_id');
    if (requested) return requested;
  }
  if (!user.firm_id) {
    throw new HTTPException(403, { message: 'Your account is not linked to a law firm' });
  }
  return user.firm_id;
}

/**
 * Loads a matter, enforcing firm ownership.
 *
 * Returns 404 rather than 403 for a matter belonging to another firm, so the endpoint
 * cannot be used to probe which matter ids exist.
 */
export async function loadOwnedMatter<T = Record<string, unknown>>(
  c: AppContext,
  matterId: string,
): Promise<T> {
  const user = c.get('user');
  const row = isSuperAdmin(user)
    ? await c.env.DB.prepare('SELECT * FROM matters WHERE id = ?1').bind(matterId).first<T>()
    : await c.env.DB.prepare('SELECT * FROM matters WHERE id = ?1 AND firm_id = ?2')
        .bind(matterId, user.firm_id)
        .first<T>();

  if (!row) throw new HTTPException(404, { message: 'Matter not found' });
  return row;
}

export function clientIp(c: AppContext): string {
  return c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? '';
}

export function isSecureRequest(c: AppContext): boolean {
  return new URL(c.req.url).protocol === 'https:';
}

/**
 * The R2 bucket, or a clear refusal.
 *
 * A deployment without R2 enabled is a real state this app can be in — everything that
 * does not touch a stored file still works. Callers get an explicit 503 saying document
 * storage is unavailable, instead of a TypeError on `undefined.put` surfacing as
 * "Something went wrong".
 */
export function requireStorage(env: Env): R2Bucket {
  if (!env.DOCUMENTS) {
    throw new HTTPException(503, {
      message: 'Document storage is not configured on this deployment, so files cannot be stored or retrieved yet.',
    });
  }
  return env.DOCUMENTS;
}
