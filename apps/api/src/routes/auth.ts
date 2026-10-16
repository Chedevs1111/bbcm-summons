import { loginSchema, type AppUser, type LawFirm } from '@bbcm/schema';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  clearedSessionCookie,
  createSession,
  destroySession,
  sessionCookie,
  verifyPassword,
} from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { LIMITS, callerKey, clearRateLimit, hitRateLimit } from '../lib/rateLimit.js';
import { isSecureRequest, requireAuth, type Env, type Variables } from '../lib/context.js';

export const authRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

/** A dummy hash so a login attempt for an unknown email costs the same as a real one. */
const DUMMY_HASH =
  'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

authRoutes.post('/login', async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? 'Invalid input' });
  }

  const { email, password } = parsed.data;
  const ipKey = `login:ip:${callerKey(c.req.raw)}`;
  const accountKey = `login:account:${email}`;

  // Checked before the password is verified, not after: PBKDF2 at 100 000 iterations
  // is the expensive part, and letting an attacker trigger it without limit is a CPU
  // exhaustion vector as much as a guessing one.
  const [byIp, byAccount] = await Promise.all([
    hitRateLimit(c.env.SESSIONS, ipKey, LIMITS.loginByIp),
    hitRateLimit(c.env.SESSIONS, accountKey, LIMITS.loginByAccount),
  ]);

  if (!byIp.allowed || !byAccount.allowed) {
    const retryAfter = Math.max(byIp.retryAfter, byAccount.retryAfter);
    c.header('Retry-After', String(retryAfter));
    throw new HTTPException(429, {
      message: 'Too many sign-in attempts. Please wait a few minutes and try again.',
    });
  }

  const user = await c.env.DB.prepare('SELECT * FROM app_users WHERE email = ?1')
    .bind(email)
    .first<AppUser>();

  // Always run a verification so timing does not reveal whether the email exists.
  const valid = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);

  if (!user || !valid || user.is_active !== 1) {
    throw new HTTPException(401, { message: 'Incorrect email or password' });
  }

  await clearRateLimit(c.env.SESSIONS, ipKey);

  const sessionId = await createSession(c.env.SESSIONS, user.id);
  c.header('Set-Cookie', sessionCookie(sessionId, isSecureRequest(c), Boolean(c.env.WEB_ORIGIN)));

  c.set('user', user);
  c.set('session_id', sessionId);
  await audit(c, { action: 'login', entity: 'app_users', entity_id: user.id });

  return c.json({ user: publicUser(user) });
});

authRoutes.post('/logout', requireAuth, async (c) => {
  await audit(c, { action: 'logout', entity: 'app_users', entity_id: c.get('user').id });
  await destroySession(c.env.SESSIONS, c.get('session_id'));
  c.header('Set-Cookie', clearedSessionCookie(isSecureRequest(c), Boolean(c.env.WEB_ORIGIN)));
  return c.json({ ok: true });
});

authRoutes.get('/me', requireAuth, async (c) => {
  const user = c.get('user');
  const firm = user.firm_id
    ? await c.env.DB.prepare('SELECT * FROM law_firms WHERE id = ?1')
        .bind(user.firm_id)
        .first<LawFirm>()
    : null;

  return c.json({ user: publicUser(user), firm });
});

/** Strips the password hash before a user record ever leaves the Worker. */
export function publicUser(user: AppUser) {
  const { password_hash: _omit, ...rest } = user;
  return rest;
}
