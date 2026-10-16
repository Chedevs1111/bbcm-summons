/**
 * Authorisation tests.
 *
 * The original app at bbcmlegal.net let an unauthenticated browser read every firm,
 * every user and every matter, and exposed working delete controls. These tests are
 * the regression guard for that: every route is checked both unauthenticated and as
 * a user belonging to a different firm.
 *
 * A cross-firm read must return 404, not 403 — a 403 would confirm that the id exists
 * and turn the endpoint into an oracle for enumerating other firms' matter ids.
 */

import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/lib/auth.js';

const FIRM_A = '11111111-1111-1111-1111-111111111111';
const FIRM_B = '22222222-2222-2222-2222-222222222222';
const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MATTER_A = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const MATTER_B = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const DOC_B = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const ATTACHMENT_B = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

const PASSWORD = 'correct-horse-battery-staple';

async function seed() {
  const hash = await hashPassword(PASSWORD);

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO law_firms (id, name, province, city) VALUES (?1, 'Firm A', 'Gauteng', 'Pretoria')",
    ).bind(FIRM_A),
    env.DB.prepare(
      "INSERT INTO law_firms (id, name, province, city) VALUES (?1, 'Firm B', 'Western Cape', 'Cape Town')",
    ).bind(FIRM_B),
    env.DB.prepare(
      `INSERT INTO app_users (id, firm_id, full_name, email, role, password_hash)
       VALUES (?1, ?2, 'Attorney A', 'a@firm-a.co.za', 'firm_admin', ?3)`,
    ).bind(USER_A, FIRM_A, hash),
    env.DB.prepare(
      `INSERT INTO app_users (id, firm_id, full_name, email, role, password_hash)
       VALUES (?1, ?2, 'Attorney B', 'b@firm-b.co.za', 'firm_admin', ?3)`,
    ).bind(USER_B, FIRM_B, hash),
    env.DB.prepare(
      `INSERT INTO matters (id, firm_id, attorney_id, case_reference, plaintiff_surname)
       VALUES (?1, ?2, ?3, 'A/2026/001', 'Mokoena')`,
    ).bind(MATTER_A, FIRM_A, USER_A),
    env.DB.prepare(
      `INSERT INTO matters (id, firm_id, attorney_id, case_reference, plaintiff_surname)
       VALUES (?1, ?2, ?3, 'B/2026/001', 'Botha')`,
    ).bind(MATTER_B, FIRM_B, USER_B),
    env.DB.prepare(
      `INSERT INTO generated_documents (id, matter_id, document_type, title, body)
       VALUES (?1, ?2, 'summons', 'Combined Summons', 'CONFIDENTIAL BODY')`,
    ).bind(DOC_B, MATTER_B),
    env.DB.prepare(
      `INSERT INTO matter_attachments (id, matter_id, document_type, file_name, storage_key)
       VALUES (?1, ?2, 'payslip', 'payslip.pdf', 'firms/b/matters/b/att')`,
    ).bind(ATTACHMENT_B, MATTER_B),
  ]);
}

async function login(email: string): Promise<string> {
  const response = await SELF.fetch('https://api.test/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  expect(response.status).toBe(200);
  const cookie = response.headers.get('Set-Cookie');
  expect(cookie).toBeTruthy();
  return cookie!.split(';')[0]!;
}

beforeAll(seed);

describe('authentication', () => {
  it('rejects a wrong password', async () => {
    const response = await SELF.fetch('https://api.test/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@firm-a.co.za', password: 'wrong' }),
    });
    expect(response.status).toBe(401);
  });

  it('gives the same answer for an unknown email as for a wrong password', async () => {
    const response = await SELF.fetch('https://api.test/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com', password: PASSWORD }),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Incorrect email or password' });
  });

  it('never returns the password hash', async () => {
    const cookie = await login('a@firm-a.co.za');
    const response = await SELF.fetch('https://api.test/api/auth/me', { headers: { Cookie: cookie } });
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).not.toContain('password_hash');
    expect(body).not.toContain('pbkdf2');
  });

  it('rejects a forged session cookie', async () => {
    const response = await SELF.fetch('https://api.test/api/matters', {
      headers: { Cookie: 'bbcm_session=not-a-real-session-id' },
    });
    expect(response.status).toBe(401);
  });
});

/**
 * The exact failure of the original app: no session, full access.
 * Every one of these must be 401.
 */
describe('unauthenticated access is refused everywhere', () => {
  const routes: Array<[string, string]> = [
    ['GET', '/api/matters'],
    ['POST', '/api/matters'],
    ['GET', `/api/matters/${MATTER_B}`],
    ['PATCH', `/api/matters/${MATTER_B}`],
    ['DELETE', `/api/matters/${MATTER_B}`],
    ['GET', `/api/matters/${MATTER_B}/attachments`],
    ['GET', `/api/matters/${MATTER_B}/attachments/${ATTACHMENT_B}/file`],
    ['GET', `/api/matters/${MATTER_B}/review`],
    ['POST', `/api/matters/${MATTER_B}/review/apply`],
    ['GET', `/api/matters/${MATTER_B}/documents`],
    ['POST', `/api/matters/${MATTER_B}/documents/generate`],
    ['GET', `/api/matters/${MATTER_B}/documents/${DOC_B}`],
    ['GET', `/api/matters/${MATTER_B}/documents/${DOC_B}/docx`],
    ['GET', `/api/matters/${MATTER_B}/bundle`],
    ['GET', `/api/matters/${MATTER_B}/bundle/1`],
    ['GET', `/api/matters/${MATTER_B}/service`],
    ['POST', `/api/matters/${MATTER_B}/service`],
    ['GET', `/api/matters/${MATTER_B}/fee-notes`],
    ['POST', `/api/matters/${MATTER_B}/fee-notes`],
    ['GET', `/api/matters/${MATTER_B}/fee-notes/${DOC_B}/pdf`],
    ['GET', `/api/matters/${MATTER_B}/service/${DOC_B}/instruction`],
    ['GET', `/api/matters/${MATTER_B}/portal-invites`],
    ['POST', `/api/matters/${MATTER_B}/portal-invites`],
    ['GET', '/api/admin/firms'],
    ['POST', '/api/admin/firms'],
    ['GET', '/api/admin/users'],
    ['POST', '/api/admin/users'],
    ['GET', '/api/admin/templates'],
    ['GET', '/api/admin/clauses'],
    ['GET', '/api/admin/audit'],
  ];

  for (const [method, path] of routes) {
    it(`${method} ${path} → 401`, async () => {
      const response = await SELF.fetch(`https://api.test${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'GET' || method === 'DELETE' ? undefined : '{}',
      });
      expect(response.status).toBe(401);
    });
  }
});

describe("firm A cannot reach firm B's data", () => {
  let cookieA = '';

  beforeAll(async () => {
    cookieA = await login('a@firm-a.co.za');
  });

  const matterRoutes: Array<[string, string]> = [
    ['GET', `/api/matters/${MATTER_B}`],
    ['PATCH', `/api/matters/${MATTER_B}`],
    ['DELETE', `/api/matters/${MATTER_B}`],
    ['GET', `/api/matters/${MATTER_B}/attachments`],
    ['POST', `/api/matters/${MATTER_B}/attachments/reorder`],
    ['GET', `/api/matters/${MATTER_B}/attachments/${ATTACHMENT_B}/file`],
    ['DELETE', `/api/matters/${MATTER_B}/attachments/${ATTACHMENT_B}`],
    ['POST', `/api/matters/${MATTER_B}/attachments/${ATTACHMENT_B}/extract`],
    ['GET', `/api/matters/${MATTER_B}/review`],
    ['POST', `/api/matters/${MATTER_B}/review/apply`],
    ['GET', `/api/matters/${MATTER_B}/documents`],
    ['POST', `/api/matters/${MATTER_B}/documents/preview`],
    ['POST', `/api/matters/${MATTER_B}/documents/generate`],
    ['GET', `/api/matters/${MATTER_B}/documents/${DOC_B}`],
    ['GET', `/api/matters/${MATTER_B}/documents/${DOC_B}/docx`],
    ['GET', `/api/matters/${MATTER_B}/bundle`],
    ['GET', `/api/matters/${MATTER_B}/bundle/1`],
    ['GET', `/api/matters/${MATTER_B}/service`],
    ['POST', `/api/matters/${MATTER_B}/service`],
    ['GET', `/api/matters/${MATTER_B}/fee-notes`],
    ['POST', `/api/matters/${MATTER_B}/fee-notes`],
    ['GET', `/api/matters/${MATTER_B}/fee-notes/${DOC_B}/pdf`],
    ['GET', `/api/matters/${MATTER_B}/service/${DOC_B}/instruction`],
    ['GET', `/api/matters/${MATTER_B}/portal-invites`],
    ['POST', `/api/matters/${MATTER_B}/portal-invites`],
  ];

  for (const [method, path] of matterRoutes) {
    it(`${method} ${path} → 404 (not 403)`, async () => {
      const response = await SELF.fetch(`https://api.test${path}`, {
        method,
        headers: { Cookie: cookieA, 'Content-Type': 'application/json' },
        body: method === 'GET' || method === 'DELETE' ? undefined : '{}',
      });
      expect(response.status).toBe(404);
    });
  }

  it("firm B's matter is absent from firm A's list", async () => {
    const response = await SELF.fetch('https://api.test/api/matters', {
      headers: { Cookie: cookieA },
    });
    const body = (await response.json()) as { matters: Array<{ id: string }> };
    expect(body.matters.map((m) => m.id)).toEqual([MATTER_A]);
  });

  it("search cannot surface firm B's parties", async () => {
    const response = await SELF.fetch('https://api.test/api/matters?search=Botha', {
      headers: { Cookie: cookieA },
    });
    const body = (await response.json()) as { matters: unknown[] };
    expect(body.matters).toHaveLength(0);
  });

  it('the admin firm list shows only their own firm', async () => {
    const response = await SELF.fetch('https://api.test/api/admin/firms', {
      headers: { Cookie: cookieA },
    });
    const body = (await response.json()) as { firms: Array<{ id: string; name: string }> };
    expect(body.firms.map((f) => f.id)).toEqual([FIRM_A]);
  });

  it("the admin user list does not leak firm B's users", async () => {
    const response = await SELF.fetch('https://api.test/api/admin/users', {
      headers: { Cookie: cookieA },
    });
    const body = (await response.json()) as { users: Array<{ email: string }> };
    expect(body.users.map((u) => u.email)).toEqual(['a@firm-a.co.za']);
  });

  it("the audit trail does not leak firm B's activity", async () => {
    const response = await SELF.fetch('https://api.test/api/admin/audit', {
      headers: { Cookie: cookieA },
    });
    const body = (await response.json()) as { entries: Array<{ firm_id: string }> };
    expect(body.entries.every((entry) => entry.firm_id === FIRM_A)).toBe(true);
  });

  it('a firm_admin cannot register a new firm', async () => {
    const response = await SELF.fetch('https://api.test/api/admin/firms', {
      method: 'POST',
      headers: { Cookie: cookieA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Sneaky Inc', province: 'Gauteng', city: 'Pretoria' }),
    });
    expect(response.status).toBe(403);
  });

  it('a firm_admin cannot escalate a new user to super_admin', async () => {
    const response = await SELF.fetch('https://api.test/api/admin/users', {
      method: 'POST',
      headers: { Cookie: cookieA, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Escalated User',
        email: 'escalated@firm-a.co.za',
        role: 'super_admin',
        password: 'a-very-long-password',
      }),
    });
    expect(response.status).toBe(403);
  });
});

describe('firm_id cannot be forged from the request body', () => {
  it("a matter created while claiming firm B's id still belongs to firm A", async () => {
    const cookieA = await login('a@firm-a.co.za');

    const response = await SELF.fetch('https://api.test/api/matters', {
      method: 'POST',
      headers: { Cookie: cookieA, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firm_id: FIRM_B, // attacker-supplied — must be ignored
        attorney_id: USER_A,
        province: 'Gauteng',
        court_type: 'high_court',
        court_name: 'Gauteng Division, Pretoria',
        marriage_date: '2015-02-14',
        marriage_place: 'Pretoria',
        marriage_type: 'civil',
        marriage_regime: 'in_community',
        plaintiff: { full_names: 'Test', surname: 'Plaintiff', physical_address: '1 Road' },
        defendant: { full_names: 'Test', surname: 'Defendant', physical_address: '2 Road' },
      }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { matter: { id: string; firm_id: string } };
    expect(body.matter.firm_id).toBe(FIRM_A);

    // And firm B still cannot see it.
    const cookieB = await login('b@firm-b.co.za');
    const asB = await SELF.fetch(`https://api.test/api/matters/${body.matter.id}`, {
      headers: { Cookie: cookieB },
    });
    expect(asB.status).toBe(404);
  });
});

describe('session lifecycle', () => {
  it('a logged-out session stops working immediately', async () => {
    const cookie = await login('a@firm-a.co.za');

    const before = await SELF.fetch('https://api.test/api/matters', { headers: { Cookie: cookie } });
    expect(before.status).toBe(200);

    await SELF.fetch('https://api.test/api/auth/logout', {
      method: 'POST',
      headers: { Cookie: cookie },
    });

    const after = await SELF.fetch('https://api.test/api/matters', { headers: { Cookie: cookie } });
    expect(after.status).toBe(401);
  });

  it('a deactivated user cannot use an existing session', async () => {
    const cookie = await login('b@firm-b.co.za');
    await env.DB.prepare('UPDATE app_users SET is_active = 0 WHERE id = ?1').bind(USER_B).run();

    const response = await SELF.fetch('https://api.test/api/matters', { headers: { Cookie: cookie } });
    expect(response.status).toBe(401);

    await env.DB.prepare('UPDATE app_users SET is_active = 1 WHERE id = ?1').bind(USER_B).run();
  });
});
