/**
 * Password hashing and session management.
 *
 * Runs entirely on Web Crypto so it works inside a Worker with no native modules.
 * Passwords use PBKDF2-HMAC-SHA256; sessions are opaque random ids stored in KV with
 * a TTL, so revoking a session is a single KV delete.
 */

import type { AppUser } from '@bbcm/schema';

/*
 * Cloudflare Workers refuses PBKDF2 above 100 000 iterations:
 *
 *   Pbkdf2 failed: iteration counts above 100000 are not supported
 *
 * This was 210 000, which meant derive() threw in production, verifyPassword caught it
 * and returned false, and no one could ever sign in — while every test passed, because
 * the local test runtime does not enforce the cap. Do not raise this without checking
 * against a deployed Worker; a passing suite will not tell you.
 */
const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

export const SESSION_COOKIE = 'bbcm_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours — a working day

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function derive(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    key,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

/** Produces a self-describing hash: `pbkdf2$<iterations>$<salt>$<hash>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

/** Compares two byte arrays without leaking timing information. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 1000) return false;

  try {
    const salt = fromBase64(parts[2]!);
    const expected = fromBase64(parts[3]!);
    const actual = await derive(password, salt, iterations);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export interface SessionRecord {
  user_id: string;
  created_at: number;
}

export function newSessionId(): string {
  return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
}

export async function createSession(kv: KVNamespace, userId: string): Promise<string> {
  const id = newSessionId();
  const record: SessionRecord = { user_id: userId, created_at: Date.now() };
  await kv.put(`session:${id}`, JSON.stringify(record), { expirationTtl: SESSION_TTL_SECONDS });
  return id;
}

export async function readSession(kv: KVNamespace, id: string): Promise<SessionRecord | null> {
  if (!id) return null;
  return await kv.get<SessionRecord>(`session:${id}`, 'json');
}

export async function destroySession(kv: KVNamespace, id: string): Promise<void> {
  if (id) await kv.delete(`session:${id}`);
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

export function sessionCookie(id: string, secure: boolean, crossOrigin = false): string {
  // A cross-origin SPA cannot receive a SameSite=Lax cookie on its XHR, so cross-origin
  // mode uses SameSite=None — which the browser only accepts together with Secure. The
  // API's mutations are all application/json, so they are preflighted and a foreign
  // origin is refused by CORS before any cookie is honoured; that is what keeps
  // SameSite=None from opening a CSRF hole here.
  const sameSite = crossOrigin ? 'None' : 'Lax';
  const attributes = [
    `${SESSION_COOKIE}=${id}`,
    'Path=/',
    'HttpOnly',
    `SameSite=${sameSite}`,
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (secure || crossOrigin) attributes.push('Secure');
  return attributes.join('; ');
}

export function clearedSessionCookie(secure: boolean, crossOrigin = false): string {
  const sameSite = crossOrigin ? 'None' : 'Lax';
  const attributes = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', `SameSite=${sameSite}`, 'Max-Age=0'];
  if (secure || crossOrigin) attributes.push('Secure');
  return attributes.join('; ');
}

/** The authenticated principal carried through every request. */
export interface Principal {
  user: AppUser;
  session_id: string;
}

export function isSuperAdmin(user: AppUser): boolean {
  return user.role === 'super_admin';
}

export function canAdminister(user: AppUser): boolean {
  return user.role === 'super_admin' || user.role === 'firm_admin';
}
