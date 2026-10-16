#!/usr/bin/env node
/**
 * Creates the first firm and the first administrator on a fresh deployment.
 *
 * Firms and users are created through /api/admin/*, which requires a signed-in
 * administrator — so on an empty database there is no way in. This script is the one
 * path that sits outside the API and solves that, and it is deliberately narrow: it
 * refuses to run once any user exists, so it cannot be used later to quietly add an
 * account to a live system.
 *
 * It is NOT apps/api/scripts/seed.mjs. That writes a demo firm with a password printed
 * on screen and belongs only on a local machine. This asks you for a password, never
 * displays it, and never stores anything but the hash.
 *
 *   node scripts/bootstrap-firm.mjs --remote
 *
 * There is no password reset in this application. If you lose this password the only
 * way back in is to run this again against an emptied database, so put it in a password
 * manager before you type it here.
 */

import { execFileSync } from 'node:child_process';
import { webcrypto as crypto } from 'node:crypto';
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const CONFIG = 'apps/api/wrangler.toml';
const DATABASE = 'bbcm-summons';

const remote = process.argv.includes('--remote');
const PBKDF2_ITERATIONS = 100_000; // Workers caps PBKDF2 at 100k — see apps/api/src/lib/auth.ts
const MIN_PASSWORD = 12;

/*
 * --allow-weak-password
 *
 * Accepts a password shorter than the minimum. It exists so the choice is explicit and
 * visible in the command that made it, rather than the floor being quietly lowered for
 * everyone. This account holds ID numbers, payslips and divorce records; a short
 * password on it is a decision, not a default.
 */
const allowWeak = process.argv.includes('--allow-weak-password');

const KEY_ENTER = ['\r', '\n'];
const KEY_CTRL_C = '\u0003';
const KEY_BACKSPACE = ['\u007f', '\b'];

function d1(sql, json = true) {
  const args = ['wrangler', 'd1', 'execute', DATABASE, remote ? '--remote' : '--local',
                '--config', CONFIG, '--command', sql];
  if (json) args.push('--json');
  const out = execFileSync('npx', args, {
    cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (!json) return null;
  return JSON.parse(out.slice(out.indexOf('[')))[0].results;
}

const b64 = (bytes) => Buffer.from(bytes).toString('base64');

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, key, 256,
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}

const interactive = Boolean(process.stdin.isTTY);
const rl = interactive
  ? createInterface({ input: process.stdin, output: process.stdout })
  : null;

/**
 * Answers supplied on stdin, read in one go.
 *
 * readline emits every line of a pipe as soon as it arrives, before the later questions
 * have registered their handlers — so asking one question at a time silently loses the
 * answers and hangs. Draining stdin first avoids that entirely.
 */
let piped = [];
async function drainStdin() {
  if (interactive) return;
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  piped = Buffer.concat(chunks).toString('utf8').split('\n');
}

const ask = (question, fallback = '') => {
  if (!interactive) {
    const answer = (piped.shift() ?? '').trim();
    const value = answer || fallback;
    console.log(`${question}: ${value}`);
    return Promise.resolve(value);
  }
  return new Promise((resolve) => {
    rl.question(fallback ? `${question} [${fallback}]: ` : `${question}: `, (answer) =>
      resolve(answer.trim() || fallback));
  });
};

/**
 * Reads a line without echoing it.
 *
 * The password must not appear on screen, in scrollback, or in shell history — which
 * also rules out passing it as an argument or an environment variable.
 */
function askSecret(question) {
  // Piped input (a script, a test) has no terminal to suppress echo on, so fall back to
  // reading a plain line. The interactive path — the one a person actually uses — still
  // never echoes and never touches argv or the environment.
  if (!interactive) return Promise.resolve((piped.shift() ?? '').trim());

  return new Promise((resolve) => {
    process.stdout.write(`${question}: `);
    const wasRaw = Boolean(process.stdin.isRaw);
    process.stdin.setRawMode?.(true);
    process.stdin.resume();

    let value = '';
    const onData = (chunk) => {
      const char = chunk.toString('utf8');

      if (KEY_ENTER.includes(char)) {
        process.stdin.setRawMode?.(wasRaw);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(value);
        return;
      }
      if (char === KEY_CTRL_C) {
        process.stdout.write('\n');
        process.exit(130);
      }
      if (KEY_BACKSPACE.includes(char)) {
        value = value.slice(0, -1);
        return;
      }
      value += char;
    };

    process.stdin.on('data', onData);
  });
}

/** The eight starter templates, read from the same file the application ships. */
function loadStarterTemplates() {
  const source = readFileSync(
    path.resolve(root, 'packages/documents/src/templates.ts'), 'utf8',
  );
  const bodies = {};
  const pattern = /^const ([A-Z][A-Z0-9_]*)\s*=\s*`([\s\S]*?)`;$/gm;
  for (const match of source.matchAll(pattern)) bodies[match[1]] = match[2];
  return bodies;
}

function requireBody(bodies, name) {
  const body = bodies[name];
  if (typeof body !== 'string' || !body.trim()) {
    throw new Error(
      `Template body ${name} could not be read from templates.ts — ` +
      'refusing to write a broken template.',
    );
  }
  return body;
}

const esc = (value) => String(value).replace(/'/g, "''");

async function main() {
  await drainStdin();
  console.log(`\nBootstrapping the ${remote ? 'REMOTE (deployed)' : 'local'} database "${DATABASE}".\n`);

  // The safety property of this script: it only works on a system with no users.
  const [{ n: userCount }] = d1('SELECT COUNT(*) AS n FROM app_users');
  if (userCount > 0) {
    console.error(
      `This database already has ${userCount} user(s).\n\n` +
      'Refusing to run. Create further users from inside the application under\n' +
      'Admin → Users, so the action is authenticated and lands in the audit trail.',
    );
    process.exit(1);
  }

  console.log('Firm');
  const firmName = await ask('  Firm name');
  if (!firmName) {
    console.error('\nA firm name is required.');
    process.exit(1);
  }
  const province = await ask('  Province', 'Gauteng');
  const city = await ask('  City', 'Pretoria');
  const firmPhone = await ask('  Phone', '');
  const firmEmail = await ask('  Email', '');
  const firmAddress = await ask('  Address', '');
  const firmLpc = await ask('  LPC number', '');

  console.log('\nAdministrator');
  const fullName = await ask('  Full name');
  const email = (await ask('  Email')).toLowerCase();
  if (!fullName || !email) {
    console.error('\nName and email are both required.');
    process.exit(1);
  }
  const userLpc = await ask('  LPC number', '');

  console.log(
    `\nChoose a password (${MIN_PASSWORD}+ characters). It is not shown as you type,\n` +
    'and this application has no password reset — save it somewhere first.',
  );
  const password = await askSecret('  Password');
  const again = await askSecret('  Confirm');
  rl?.close();

  if (password.length < MIN_PASSWORD && !allowWeak) {
    console.error(
      `\nToo short — ${MIN_PASSWORD} characters minimum. Nothing was written.\n` +
      'Re-run with --allow-weak-password if that is genuinely what you want.',
    );
    process.exit(1);
  }
  if (password.length < MIN_PASSWORD) {
    console.warn(
      `\n  WARNING: ${password.length} characters, below the ${MIN_PASSWORD} minimum.\n` +
      '  This account can read every matter, ID number and payslip in the system, and\n' +
      '  the sign-in page is reachable from anywhere. Change it under Settings when you can.',
    );
  }
  if (password !== again) {
    console.error('\nThe two entries do not match. Nothing was written.');
    process.exit(1);
  }

  const firmId = crypto.randomUUID();
  const branchId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const hash = await hashPassword(password);

  const bodies = loadStarterTemplates();
  const templates = [
    ['Standard Combined Summons', 'summons', null, 0, null, 1, 'SUMMONS_BODY'],
    ['Contested Summons', 'summons', null, 1, null, 0, 'CONTESTED_SUMMONS_BODY'],
    ['Accrual Particulars', 'particulars_of_claim', 'out_of_community_with_accrual', 0, null, 1, 'ACCRUAL_PARTICULARS_BODY'],
    ['In Community Particulars', 'particulars_of_claim', 'in_community', 0, null, 0, 'IN_COMMUNITY_PARTICULARS_BODY'],
    ['Standard Settlement (Children)', 'settlement_agreement', null, 0, 1, 0, 'SETTLEMENT_BODY_CHILDREN'],
    ['Standard Settlement (No Children)', 'settlement_agreement', null, 0, 0, 1, 'SETTLEMENT_BODY_NO_CHILDREN'],
    ['Standard Index Page', 'index_page', null, 0, null, 1, 'INDEX_BODY'],
    ['Standard Annexure Schedule', 'annexure_schedule', null, 0, null, 1, 'ANNEXURE_SCHEDULE_BODY'],
  ];

  // Bodies are read before anything is written, so a missing template fails the run
  // rather than leaving a firm with half its templates.
  const resolved = templates.map((row) => [...row, requireBody(bodies, row[6])]);

  const statements = [
    `INSERT INTO law_firms (id, name, province, city, phone, email, address, lpc_number)
     VALUES ('${firmId}', '${esc(firmName)}', '${esc(province)}', '${esc(city)}',
             '${esc(firmPhone)}', '${esc(firmEmail)}', '${esc(firmAddress)}', '${esc(firmLpc)}')`,
    `INSERT INTO branches (id, firm_id, name, city)
     VALUES ('${branchId}', '${firmId}', 'Main', '${esc(city)}')`,
    `INSERT INTO app_users (id, firm_id, branch_id, full_name, email, role, lpc_number, password_hash)
     VALUES ('${userId}', '${firmId}', '${branchId}', '${esc(fullName)}', '${esc(email)}',
             'firm_admin', '${esc(userLpc)}', '${esc(hash)}')`,
    ...resolved.map(([name, type, regime, contested, children, isDefault, , body]) =>
      `INSERT INTO firm_templates (id, firm_id, name, document_type, marriage_regime,
                                   is_contested, has_children, body, is_default)
       VALUES ('${crypto.randomUUID()}', '${firmId}', '${esc(name)}', '${type}',
               ${regime ? `'${regime}'` : 'NULL'}, ${contested},
               ${children === null ? 'NULL' : children},
               '${esc(body)}', ${isDefault})`),
  ];

  console.log('\nWriting…');
  for (const sql of statements) d1(sql.replace(/\s+/g, ' '), false);

  const [counts] = d1(
    'SELECT (SELECT COUNT(*) FROM law_firms) AS firms, ' +
    '(SELECT COUNT(*) FROM app_users) AS users, ' +
    '(SELECT COUNT(*) FROM firm_templates) AS templates',
  );

  console.log(`\nCreated: ${counts.firms} firm, ${counts.users} user, ${counts.templates} templates.`);
  console.log(`\nSign in at ${remote ? 'https://bbcm-summons-api.bbcm.workers.dev' : 'http://localhost:5173'}`);
  console.log(`  ${email}`);
  console.log('  the password you just chose\n');
}

main().catch((error) => {
  console.error('\nBootstrap failed:', error.message ?? error);
  process.exit(1);
});
