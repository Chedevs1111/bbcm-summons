/**
 * Rate limiting on the endpoints reachable without a session.
 *
 * Login is the one an attacker can reach for free, and it runs PBKDF2 at 100 000
 * iterations on every attempt — so an unbounded login is a CPU exhaustion vector as
 * much as a password-guessing one.
 */

import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/lib/auth.js';
import { LIMITS } from '../src/lib/rateLimit.js';

const FIRM = '99999999-9999-9999-9999-999999999999';
const USER = 'aaaa1111-2222-3333-4444-555566667777';
const PASSWORD = 'rate-limit-test-password';

beforeAll(async () => {
  const hash = await hashPassword(PASSWORD);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO law_firms (id, name, province, city) VALUES (?1, 'RL Firm', 'Gauteng', 'Pretoria')",
    ).bind(FIRM),
    env.DB.prepare(
      `INSERT INTO app_users (id, firm_id, full_name, email, role, password_hash)
       VALUES (?1, ?2, 'RL User', 'rl@firm.co.za', 'attorney', ?3)`,
    ).bind(USER, FIRM, hash),
  ]);
});

function attempt(email: string, password: string) {
  return SELF.fetch('https://api.test/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

describe('login rate limiting', () => {
  it('locks out after the per-IP limit and says when to retry', async () => {
    let blocked: Response | null = null;

    // One past the limit, since the limit itself is still permitted.
    for (let i = 0; i < LIMITS.loginByIp.limit + 1; i += 1) {
      const response = await attempt('rl@firm.co.za', 'wrong-password');
      if (response.status === 429) {
        blocked = response;
        break;
      }
      expect(response.status).toBe(401);
    }

    expect(blocked, 'login should stop accepting attempts').not.toBeNull();
    const retryAfter = Number(blocked!.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(LIMITS.loginByIp.windowSeconds);
  });

  /**
   * The limit has to be checked before the password is verified — otherwise a blocked
   * attacker is still burning a full PBKDF2 run per request.
   */
  it('rejects a blocked attempt without verifying the password', async () => {
    for (let i = 0; i < LIMITS.loginByIp.limit + 2; i += 1) {
      await attempt('rl@firm.co.za', 'wrong-password');
    }

    // The correct password is refused too: the gate is in front of verification.
    const response = await attempt('rl@firm.co.za', PASSWORD);
    expect(response.status).toBe(429);
  });

  it('does not reveal whether the account exists', async () => {
    const known = await attempt('rl@firm.co.za', 'wrong');
    const unknown = await attempt('nobody@nowhere.co.za', 'wrong');
    expect(known.status).toBe(unknown.status);
    expect(await known.json()).toEqual(await unknown.json());
  });

  it('clears the counter once a sign-in succeeds', async () => {
    // A few fat-fingered attempts, then the right password.
    for (let i = 0; i < 3; i += 1) await attempt('rl@firm.co.za', 'wrong');

    const ok = await attempt('rl@firm.co.za', PASSWORD);
    expect(ok.status).toBe(200);

    // The budget is back, so an honest user is not throttled for the rest of the window.
    for (let i = 0; i < LIMITS.loginByIp.limit - 1; i += 1) {
      const response = await attempt('rl@firm.co.za', 'wrong');
      expect(response.status).toBe(401);
    }
  });

  /**
   * The per-account limit is deliberately looser than the per-IP one. A tight one
   * would let anyone lock a named attorney out of their own files just by failing
   * logins against their address.
   */
  it('keeps the per-account limit above the per-IP limit', () => {
    expect(LIMITS.loginByAccount.limit).toBeGreaterThan(LIMITS.loginByIp.limit);
  });
});

describe('portal rate limiting', () => {
  it('bounds unauthenticated portal reads', async () => {
    const token = 'a'.repeat(64); // Never valid, but still costs a lookup.
    let blocked = false;

    for (let i = 0; i < LIMITS.portalRead.limit + 2; i += 1) {
      const response = await SELF.fetch(`https://api.test/api/portal/${token}`);
      if (response.status === 429) {
        blocked = true;
        expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0);
        break;
      }
      // Everything short of the limit is the usual uniform 404.
      expect(response.status).toBe(404);
    }

    expect(blocked, 'portal reads should be bounded').toBe(true);
  });
});
