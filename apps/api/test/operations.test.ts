/**
 * Firm operations: Sheriff service, fee notes and the client portal.
 *
 * The portal tests carry the most weight here. It is the one surface that grants
 * access without a session, so it is the one most likely to become the next
 * bbcmlegal.net if it is wrong.
 */

import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/lib/auth.js';

const FIRM_A = '33333333-3333-3333-3333-333333333333';
const FIRM_B = '44444444-4444-4444-4444-444444444444';
const USER_A = '55555555-5555-5555-5555-555555555555';
const USER_B = '66666666-6666-6666-6666-666666666666';
const MATTER_A = '77777777-7777-7777-7777-777777777777';
const MATTER_B = '88888888-8888-8888-8888-888888888888';

const PASSWORD = 'operations-test-password';

async function login(email: string): Promise<string> {
  const response = await SELF.fetch('https://api.test/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  expect(response.status).toBe(200);
  return response.headers.get('Set-Cookie')!.split(';')[0]!;
}

let cookieA = '';
let cookieB = '';

beforeAll(async () => {
  const hash = await hashPassword(PASSWORD);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO law_firms (id, name, province, city, phone, email) VALUES (?1, 'Ops Firm A', 'Gauteng', 'Pretoria', '012 000 0000', 'a@ops.co.za')",
    ).bind(FIRM_A),
    env.DB.prepare(
      "INSERT INTO law_firms (id, name, province, city) VALUES (?1, 'Ops Firm B', 'Western Cape', 'Cape Town')",
    ).bind(FIRM_B),
    env.DB.prepare(
      `INSERT INTO app_users (id, firm_id, full_name, email, role, password_hash)
       VALUES (?1, ?2, 'Ops A', 'ops-a@firm.co.za', 'attorney', ?3)`,
    ).bind(USER_A, FIRM_A, hash),
    env.DB.prepare(
      `INSERT INTO app_users (id, firm_id, full_name, email, role, password_hash)
       VALUES (?1, ?2, 'Ops B', 'ops-b@firm.co.za', 'attorney', ?3)`,
    ).bind(USER_B, FIRM_B, hash),
    env.DB.prepare(
      `INSERT INTO matters
        (id, firm_id, attorney_id, case_reference, case_number, court_name,
         plaintiff_surname, plaintiff_full_names, plaintiff_id_number,
         defendant_surname, defendant_full_names, defendant_id_number, status)
       VALUES (?1, ?2, ?3, 'A/2026/900', '900/2026', 'Gauteng Division, Pretoria',
               'Mokoena', 'Thandiwe Grace', '8801010509084',
               'Mokoena', 'Sipho Daniel', '8506155048083', 'active')`,
    ).bind(MATTER_A, FIRM_A, USER_A),
    env.DB.prepare(
      `INSERT INTO matters (id, firm_id, attorney_id, case_reference, plaintiff_surname)
       VALUES (?1, ?2, ?3, 'B/2026/900', 'Botha')`,
    ).bind(MATTER_B, FIRM_B, USER_B),
  ]);

  cookieA = await login('ops-a@firm.co.za');
  cookieB = await login('ops-b@firm.co.za');
});

async function post(path: string, body: unknown, cookie = cookieA) {
  return SELF.fetch(`https://api.test${path}`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function patch(path: string, body: unknown, cookie = cookieA) {
  return SELF.fetch(`https://api.test${path}`, {
    method: 'PATCH',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------

describe('Sheriff service tracking', () => {
  it('records an instruction to the Sheriff', async () => {
    const response = await post(`/api/matters/${MATTER_A}/service`, {
      sheriff_office: 'Sheriff Pretoria East',
      service_address: '12 Protea Road, Centurion',
      manner: 'domicilium',
      instructed_at: '2026-08-03',
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { event: { id: string; status: string } };
    expect(body.event.status).toBe('instructed');
  });

  /**
   * Service is a chain of real events. The record should only move forward, or a
   * matter could show a filed return for service that was never attempted.
   */
  it('walks instructed → served → return_filed', async () => {
    const created = await post(`/api/matters/${MATTER_A}/service`, {
      sheriff_office: 'Sheriff Centurion',
      service_address: '12 Protea Road',
      manner: 'personal',
    });
    const { event } = (await created.json()) as { event: { id: string } };

    const served = await patch(`/api/matters/${MATTER_A}/service/${event.id}`, {
      status: 'served',
      served_at: '2026-08-05',
      served_on: 'Sipho Daniel Mokoena, personally',
    });
    expect(served.status).toBe(200);

    const filed = await patch(`/api/matters/${MATTER_A}/service/${event.id}`, {
      status: 'return_filed',
      return_received_at: '2026-08-08',
    });
    expect(filed.status).toBe(200);
    expect(((await filed.json()) as { event: { status: string } }).event.status).toBe('return_filed');
  });

  it('refuses to jump straight from instructed to a filed return', async () => {
    const created = await post(`/api/matters/${MATTER_A}/service`, {
      sheriff_office: 'Sheriff Pretoria',
      manner: 'personal',
    });
    const { event } = (await created.json()) as { event: { id: string } };

    const response = await patch(`/api/matters/${MATTER_A}/service/${event.id}`, {
      status: 'return_filed',
      return_received_at: '2026-08-08',
    });
    expect(response.status).toBe(422);
  });

  it('will not mark service effected without a date', async () => {
    const created = await post(`/api/matters/${MATTER_A}/service`, { manner: 'personal' });
    const { event } = (await created.json()) as { event: { id: string } };
    const response = await patch(`/api/matters/${MATTER_A}/service/${event.id}`, {
      status: 'served',
    });
    expect(response.status).toBe(422);
  });

  it('will not record non-service without a reason', async () => {
    const created = await post(`/api/matters/${MATTER_A}/service`, { manner: 'personal' });
    const { event } = (await created.json()) as { event: { id: string } };
    const response = await patch(`/api/matters/${MATTER_A}/service/${event.id}`, {
      status: 'not_served',
    });
    expect(response.status).toBe(422);
  });

  it('allows re-instruction after a failed attempt', async () => {
    const created = await post(`/api/matters/${MATTER_A}/service`, { manner: 'personal' });
    const { event } = (await created.json()) as { event: { id: string } };

    await patch(`/api/matters/${MATTER_A}/service/${event.id}`, {
      status: 'not_served',
      non_service_reason: 'Address vacant; neighbour confirmed the defendant moved.',
    });
    const again = await patch(`/api/matters/${MATTER_A}/service/${event.id}`, {
      status: 'instructed',
    });
    expect(again.status).toBe(200);
  });

  /**
   * Self-contained: the workers pool rolls back storage between tests, so this
   * builds the whole chain itself rather than leaning on an earlier test's rows.
   */
  it('reports whether service has been proved', async () => {
    const before = (await (
      await SELF.fetch(`https://api.test/api/matters/${MATTER_A}/service`, {
        headers: { Cookie: cookieA },
      })
    ).json()) as { summary: { service_proved: boolean } };
    expect(before.summary.service_proved).toBe(false);

    const created = await post(`/api/matters/${MATTER_A}/service`, { manner: 'personal' });
    const { event } = (await created.json()) as { event: { id: string } };
    await patch(`/api/matters/${MATTER_A}/service/${event.id}`, {
      status: 'served',
      served_at: '2026-08-05',
    });
    await patch(`/api/matters/${MATTER_A}/service/${event.id}`, {
      status: 'return_filed',
      return_received_at: '2026-08-08',
    });

    const after = (await (
      await SELF.fetch(`https://api.test/api/matters/${MATTER_A}/service`, {
        headers: { Cookie: cookieA },
      })
    ).json()) as { summary: { service_proved: boolean; awaiting_return: boolean } };

    expect(after.summary.service_proved).toBe(true);
    expect(after.summary.awaiting_return).toBe(false);
  });

  it("keeps another firm out of the service record", async () => {
    const response = await SELF.fetch(`https://api.test/api/matters/${MATTER_A}/service`, {
      headers: { Cookie: cookieB },
    });
    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------

describe('fee notes', () => {
  it('allocates a sequential note number and totals the lines', async () => {
    const response = await post(`/api/matters/${MATTER_A}/fee-notes`, {
      lines: [
        { description: 'Consultation', kind: 'fee', account: 'business', quantity: 2, unit_amount: 1500 },
        { description: "Sheriff's fee", kind: 'disbursement', account: 'trust', unit_amount: 350, vatable: false },
      ],
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      fee_note: { note_number: string; totals: { fees: number; trust: number; vat: number; total: number } };
    };
    expect(body.fee_note.note_number).toMatch(/^FN\d{4}-\d{4}$/);
    expect(body.fee_note.totals.fees).toBe(3000);
    expect(body.fee_note.totals.trust).toBe(350);
    expect(body.fee_note.totals.vat).toBe(450);
    expect(body.fee_note.totals.total).toBe(3800);
  });

  /**
   * Once a note is issued the client is holding a copy. Amending the lines would
   * leave them with a document that no longer matches the firm's record.
   */
  it('freezes the lines once a note is issued', async () => {
    const created = await post(`/api/matters/${MATTER_A}/fee-notes`, {
      lines: [{ description: 'Drafting', unit_amount: 2000 }],
    });
    const { fee_note } = (await created.json()) as { fee_note: { id: string } };

    const issued = await patch(`/api/matters/${MATTER_A}/fee-notes/${fee_note.id}`, {
      status: 'issued',
    });
    expect(issued.status).toBe(200);
    // Issuing stamps the date when none was given.
    expect(((await issued.json()) as { fee_note: { issued_at: string } }).fee_note.issued_at).toBeTruthy();

    const amend = await patch(`/api/matters/${MATTER_A}/fee-notes/${fee_note.id}`, {
      lines: [{ description: 'Drafting', unit_amount: 9999 }],
    });
    expect(amend.status).toBe(422);
  });

  it('will not delete an issued note', async () => {
    const created = await post(`/api/matters/${MATTER_A}/fee-notes`, {
      lines: [{ description: 'Appearance', unit_amount: 5000 }],
    });
    const { fee_note } = (await created.json()) as { fee_note: { id: string } };

    const draftDelete = await SELF.fetch(
      `https://api.test/api/matters/${MATTER_A}/fee-notes/${fee_note.id}`,
      { method: 'DELETE', headers: { Cookie: cookieA } },
    );
    expect(draftDelete.status).toBe(200);

    const second = await post(`/api/matters/${MATTER_A}/fee-notes`, {
      lines: [{ description: 'Appearance', unit_amount: 5000 }],
    });
    const { fee_note: issuedNote } = (await second.json()) as { fee_note: { id: string } };
    await patch(`/api/matters/${MATTER_A}/fee-notes/${issuedNote.id}`, { status: 'issued' });

    const issuedDelete = await SELF.fetch(
      `https://api.test/api/matters/${MATTER_A}/fee-notes/${issuedNote.id}`,
      { method: 'DELETE', headers: { Cookie: cookieA } },
    );
    expect(issuedDelete.status).toBe(422);
  });

  it("keeps another firm out of the fee notes", async () => {
    const response = await SELF.fetch(`https://api.test/api/matters/${MATTER_A}/fee-notes`, {
      headers: { Cookie: cookieB },
    });
    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------

describe('client portal', () => {
  async function makeInvite(over: Record<string, unknown> = {}) {
    const response = await post(`/api/matters/${MATTER_A}/portal-invites`, {
      party: 'plaintiff',
      label: 'Mrs Mokoena',
      ...over,
    });
    expect(response.status).toBe(201);
    return (await response.json()) as { id: string; token: string; path: string };
  }

  it('issues a token and resolves it to the matter', async () => {
    const invite = await makeInvite();
    expect(invite.token).toMatch(/^[0-9a-f]{64}$/);

    const response = await SELF.fetch(`https://api.test/api/portal/${invite.token}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      matter: { reference: string; parties: string };
      firm: { name: string };
    };
    expect(body.matter.reference).toBe('A/2026/900');
    expect(body.matter.parties).toBe('Mokoena v Mokoena');
    expect(body.firm.name).toBe('Ops Firm A');
  });

  it('never returns the token hash to the attorney listing', async () => {
    await makeInvite();
    const response = await SELF.fetch(`https://api.test/api/matters/${MATTER_A}/portal-invites`, {
      headers: { Cookie: cookieA },
    });
    const raw = await response.text();
    expect(raw).not.toContain('token_hash');
  });

  /**
   * The portal must expose status, not the file. A client link that leaked the other
   * party's ID number or income would be a POPIA problem in its own right.
   */
  it('exposes no privileged or opposing-party detail', async () => {
    const invite = await makeInvite();
    const raw = await (await SELF.fetch(`https://api.test/api/portal/${invite.token}`)).text();

    for (const secret of [
      '8801010509084', // plaintiff ID number
      '8506155048083', // defendant ID number
      'Thandiwe Grace', // full names
      'Sipho Daniel',
      'password_hash',
      'pbkdf2',
    ]) {
      expect(raw, `portal response must not contain ${secret}`).not.toContain(secret);
    }
  });

  it('lists what is still outstanding from the client', async () => {
    const invite = await makeInvite();
    const body = (await (
      await SELF.fetch(`https://api.test/api/portal/${invite.token}`)
    ).json()) as { outstanding: Array<{ type: string }> };
    expect(body.outstanding.map((item) => item.type)).toContain('marriage_certificate');
  });

  it('gives the same 404 for unknown, malformed, revoked and expired tokens', async () => {
    const unknown = 'f'.repeat(64);
    const malformed = 'not-a-token';

    for (const token of [unknown, malformed]) {
      const response = await SELF.fetch(`https://api.test/api/portal/${token}`);
      expect(response.status, token).toBe(404);
    }

    const revoked = await makeInvite();
    await SELF.fetch(`https://api.test/api/matters/${MATTER_A}/portal-invites/${revoked.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookieA },
    });
    expect((await SELF.fetch(`https://api.test/api/portal/${revoked.token}`)).status).toBe(404);

    // Expiry is enforced on read, so backdating the row is enough to test it.
    const expired = await makeInvite();
    await env.DB.prepare(
      "UPDATE portal_invites SET expires_at = '2020-01-01T00:00:00.000Z' WHERE id = ?1",
    )
      .bind(expired.id)
      .run();
    expect((await SELF.fetch(`https://api.test/api/portal/${expired.token}`)).status).toBe(404);
  });

  it('counts uses so an attorney can spot a shared link', async () => {
    const invite = await makeInvite();
    await SELF.fetch(`https://api.test/api/portal/${invite.token}`);
    await SELF.fetch(`https://api.test/api/portal/${invite.token}`);

    const list = (await (
      await SELF.fetch(`https://api.test/api/matters/${MATTER_A}/portal-invites`, {
        headers: { Cookie: cookieA },
      })
    ).json()) as { invites: Array<{ id: string; use_count: number }> };

    expect(list.invites.find((row) => row.id === invite.id)?.use_count).toBe(2);
  });

  it('refuses uploads on a read-only link', async () => {
    const invite = await makeInvite({ can_upload: false });
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' }), 'x.pdf');
    form.append('document_type', 'payslip');

    const response = await SELF.fetch(`https://api.test/api/portal/${invite.token}/uploads`, {
      method: 'POST',
      body: form,
    });
    expect(response.status).toBe(403);
  });

  it('accepts an upload on an upload-enabled link and files it against the matter', async () => {
    const invite = await makeInvite({ can_upload: true });
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: 'application/pdf' }),
      'marriage-certificate.pdf',
    );
    form.append('document_type', 'marriage_certificate');

    const response = await SELF.fetch(`https://api.test/api/portal/${invite.token}/uploads`, {
      method: 'POST',
      body: form,
    });
    expect(response.status).toBe(201);

    // Visible to the attorney on the matter.
    const attachments = (await (
      await SELF.fetch(`https://api.test/api/matters/${MATTER_A}/attachments`, {
        headers: { Cookie: cookieA },
      })
    ).json()) as { attachments: Array<{ file_name: string; uploaded_by: string }> };

    const uploaded = attachments.attachments.find(
      (row) => row.file_name === 'marriage-certificate.pdf',
    );
    expect(uploaded).toBeDefined();
    // Attributed to the portal invite, not to a user who never signed in.
    expect(uploaded!.uploaded_by).toMatch(/^portal:/);
  });

  it('rejects an executable disguised as a document', async () => {
    const invite = await makeInvite({ can_upload: true });
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array([1])], { type: 'application/x-msdownload' }), 'x.exe');
    form.append('document_type', 'other');

    const response = await SELF.fetch(`https://api.test/api/portal/${invite.token}/uploads`, {
      method: 'POST',
      body: form,
    });
    expect(response.status).toBe(400);
  });

  it("does not let another firm mint an invite for this matter", async () => {
    const response = await post(`/api/matters/${MATTER_A}/portal-invites`, { party: 'plaintiff' }, cookieB);
    expect(response.status).toBe(404);
  });

  it('requires a session to manage invites at all', async () => {
    const response = await SELF.fetch(`https://api.test/api/matters/${MATTER_A}/portal-invites`);
    expect(response.status).toBe(401);
  });
});
