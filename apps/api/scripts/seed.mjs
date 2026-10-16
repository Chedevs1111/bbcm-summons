#!/usr/bin/env node
/**
 * Writes a demo firm, an attorney and the eight starter templates into the local
 * D1 database, so `wrangler dev` has something to sign in to.
 *
 *   node apps/api/scripts/seed.mjs [--remote]
 *
 * The password hash is produced with the same PBKDF2 parameters the Worker uses,
 * so the seeded account logs in through the normal auth path.
 */

import { execFileSync } from 'node:child_process';
import { webcrypto as crypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, '..');
const remote = process.argv.includes('--remote');

const PBKDF2_ITERATIONS = 100_000; // Workers caps PBKDF2 at 100k — see apps/api/src/lib/auth.ts

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  const b64 = (bytes) => Buffer.from(bytes).toString('base64');
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}

/**
 * Reads the starter templates straight out of the source of truth.
 *
 * Matches any SCREAMING_SNAKE const, not just names ending in _BODY — an earlier
 * pattern silently missed SETTLEMENT_BODY_CHILDREN and seeded the string
 * "undefined" as a court template.
 */
function loadStarterTemplates() {
  const source = readFileSync(
    path.resolve(apiRoot, '../../packages/documents/src/templates.ts'),
    'utf8',
  );
  const bodies = {};
  for (const match of source.matchAll(/^const ([A-Z][A-Z0-9_]*) = `([\s\S]*?)`;$/gm)) {
    bodies[match[1]] = match[2];
  }
  return bodies;
}

/** Refuses to seed a template whose body failed to load. */
function requireBody(bodies, name) {
  const body = bodies[name];
  if (typeof body !== 'string' || body.trim() === '') {
    throw new Error(
      `Template body ${name} could not be read from templates.ts — refusing to seed a broken template.`,
    );
  }
  return body;
}

const escape = (value) => String(value).replace(/'/g, "''");

async function main() {
  const bodies = loadStarterTemplates();
  const body = (name) => requireBody(bodies, name);
  const hash = await hashPassword('bbcm-demo-password-2026');

  const firmId = '00000000-0000-4000-8000-000000000001';
  const branchId = '00000000-0000-4000-8000-000000000002';
  const userId = '00000000-0000-4000-8000-000000000003';

  const templates = [
    ['Standard Combined Summons', 'summons', null, 0, null, 1, body('SUMMONS_BODY')],
    ['Contested Summons', 'summons', null, 1, null, 0, body('CONTESTED_SUMMONS_BODY')],
    ['In Community Particulars', 'particulars_of_claim', 'in_community', 0, null, 0,
      `${body('PARTICULARS_BASE')}\n\n6. The parties are married in community of property and the joint estate falls to be divided equally between them.\n\n${body('PARTICULARS_TAIL')}`],
    ['Accrual Particulars', 'particulars_of_claim', 'out_of_community_with_accrual', 0, null, 1,
      `${body('PARTICULARS_BASE')}\n\n6. The parties are married out of community of property with the inclusion of the accrual system in terms of the Matrimonial Property Act 88 of 1984.\n\n7. The Plaintiff is entitled to a claim in respect of the accrual of the respective estates of the parties in terms of section 3 of the Matrimonial Property Act 88 of 1984, the extent of which is to be determined at the dissolution of the marriage.\n\n${body('PARTICULARS_TAIL')}`],
    ['Standard Settlement (Children)', 'settlement_agreement', null, 0, 1, 0, body('SETTLEMENT_BODY_CHILDREN')],
    ['Standard Settlement (No Children)', 'settlement_agreement', null, 0, 0, 1, body('SETTLEMENT_BODY_NO_CHILDREN')],
    ['Standard Index Page', 'index_page', null, 0, null, 1, body('INDEX_BODY')],
    ['Standard Annexure Schedule', 'annexure_schedule', null, 0, null, 1, body('ANNEXURE_SCHEDULE_BODY')],
  ];

  const clauses = [
    ['joint_estate_dissolution', 'Joint Estate Dissolution', 'Property', 'in_community', 10,
      'The parties are married to each other in community of property. Upon dissolution of the marriage the joint estate shall be divided equally between the parties, each party being entitled to one half share of the nett value of the joint estate.'],
    ['accrual_calculation', 'Accrual Calculation', 'Property', 'accrual', 11,
      'The parties are married out of community of property with the inclusion of the accrual system in terms of Chapter 1 of the Matrimonial Property Act 88 of 1984.'],
    ['children_details', 'Children Details', 'Children', 'has_children', 20,
      'There {{CHILDREN_VERB}} {{NUMBER_OF_CHILDREN}} minor {{CHILDREN_NOUN}} born of the marriage between the parties, namely:\n{{CHILDREN_LIST}}'],
    ['primary_residence', 'Primary Residence', 'Children', 'has_children', 22,
      'The primary residence of the minor children shall vest with the Plaintiff, subject to the Defendant’s rights of reasonable contact.'],
    ['irretrievable_breakdown', 'Irretrievable Breakdown', 'General', 'always', 70,
      'The marriage relationship between the parties has irretrievably broken down as contemplated in section 4 of the Divorce Act 70 of 1979.'],
  ];

  const statements = [
    // Re-runnable: refresh templates and clauses without destroying existing matters.
    `DELETE FROM firm_templates WHERE firm_id = '${firmId}'`,
    `DELETE FROM clause_library WHERE firm_id IS NULL`,
    `INSERT OR IGNORE INTO law_firms (id, name, province, city, phone, email, address, lpc_number)
     VALUES ('${firmId}', 'Van der Merwe & Associates', 'Gauteng', 'Pretoria',
             '012 345 6789', 'info@vdm-law.co.za', '123 Church Street', 'LPC12345')`,
    `INSERT OR IGNORE INTO branches (id, firm_id, name, city, address)
     VALUES ('${branchId}', '${firmId}', 'Pretoria Main', 'Pretoria', '123 Church Street')`,
    `INSERT OR IGNORE INTO app_users (id, firm_id, branch_id, full_name, email, phone, role, lpc_number, password_hash)
     VALUES ('${userId}', '${firmId}', '${branchId}', 'Adv. Bongani Chauke',
             'demo@vdm-law.co.za', '012 345 6789', 'firm_admin', 'LPC99887', '${escape(hash)}')`,
    ...templates.map(([name, type, regime, contested, children, isDefault, body], index) =>
      `INSERT INTO firm_templates
        (id, firm_id, name, document_type, marriage_regime, is_contested, has_children, body, is_active, is_default)
       VALUES ('00000000-0000-4000-8000-0000000001${String(index).padStart(2, '0')}', '${firmId}',
               '${escape(name)}', '${type}', ${regime ? `'${regime}'` : 'NULL'}, ${contested},
               ${children === null ? 'NULL' : children}, '${escape(body)}', 1, ${isDefault})`,
    ),
    ...clauses.map(([key, title, category, condition, order, body], index) =>
      `INSERT INTO clause_library (id, firm_id, key, title, category, condition, body, sort_order, is_active)
       VALUES ('00000000-0000-4000-8000-0000000002${String(index).padStart(2, '0')}', NULL,
               '${key}', '${escape(title)}', '${category}', '${condition}', '${escape(body)}', ${order}, 1)`,
    ),
  ];

  for (const statement of statements) {
    execFileSync(
      'npx',
      [
        'wrangler', 'd1', 'execute', 'bbcm-summons',
        remote ? '--remote' : '--local',
        '--config', path.join(apiRoot, 'wrangler.toml'),
        '--command', statement,
      ],
      { stdio: ['ignore', 'ignore', 'inherit'], cwd: path.resolve(apiRoot, '../..') },
    );
  }

  console.log('Seeded:');
  console.log('  Firm     Van der Merwe & Associates');
  console.log('  Email    demo@vdm-law.co.za');
  console.log('  Password bbcm-demo-password-2026');
  console.log(`  Templates ${templates.length}, clauses ${clauses.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
