/**
 * Rate limiting for endpoints reachable without a session.
 *
 * Two things need protecting:
 *
 *   1. Login. Password verification runs PBKDF2 at 100 000 iterations, so unlimited
 *      attempts are both a credential-guessing vector and a cheap way to exhaust
 *      Worker CPU. This is the one endpoint an attacker can reach for free.
 *   2. The client portal. Tokens are 256-bit and not realistically guessable, but the
 *      endpoint is unauthenticated and does real database work on every call.
 *
 * Counters live in the same KV namespace as sessions, with a TTL equal to the window,
 * so they expire on their own and there is nothing to sweep.
 */

export interface RateLimitRule {
  /** Attempts permitted inside the window. */
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the caller may retry. Only meaningful when `allowed` is false. */
  retryAfter: number;
}

interface Counter {
  count: number;
  /** Epoch millis when the current window started. */
  start: number;
}

/**
 * Records an attempt and reports whether it is permitted.
 *
 * A fixed window rather than a sliding one: it is a few lines instead of many, and the
 * worst case — an attacker aligning with a window boundary to get 2× the limit in a
 * burst — is not meaningful at these thresholds.
 */
export async function hitRateLimit(
  kv: KVNamespace,
  key: string,
  rule: RateLimitRule,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = rule.windowSeconds * 1000;
  const storageKey = `ratelimit:${key}`;

  let counter: Counter | null = null;
  try {
    counter = await kv.get<Counter>(storageKey, 'json');
  } catch {
    // A KV read failure must not lock every user out of the product.
    return { allowed: true, remaining: rule.limit, retryAfter: 0 };
  }

  const expired = !counter || now - counter.start >= windowMs;
  const next: Counter = expired ? { count: 1, start: now } : { count: counter!.count + 1, start: counter!.start };

  const elapsed = now - next.start;
  const retryAfter = Math.max(1, Math.ceil((windowMs - elapsed) / 1000));

  // KV TTL has a 60-second floor, so short windows are stored for the minimum and the
  // timestamp inside the value does the real work.
  await kv.put(storageKey, JSON.stringify(next), {
    expirationTtl: Math.max(60, rule.windowSeconds),
  });

  if (next.count > rule.limit) {
    return { allowed: false, remaining: 0, retryAfter };
  }
  return { allowed: true, remaining: rule.limit - next.count, retryAfter: 0 };
}

/** Clears a counter — called after a successful login so honest users are not punished. */
export async function clearRateLimit(kv: KVNamespace, key: string): Promise<void> {
  try {
    await kv.delete(`ratelimit:${key}`);
  } catch {
    // Not worth failing a successful login over.
  }
}

/**
 * Identifies the caller.
 *
 * `CF-Connecting-IP` is set by Cloudflare and cannot be spoofed by the client, unlike
 * `X-Forwarded-For`, which is why it is preferred. Local dev has neither, so requests
 * share a bucket there — fine, since the limits are generous.
 */
export function callerKey(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'local';
}

export const LIMITS = {
  /**
   * Login, per IP. Ten attempts a quarter-hour is far more than a person needs and far
   * less than a guessing run.
   */
  loginByIp: { limit: 10, windowSeconds: 900 },

  /**
   * Login, per account. Deliberately more generous than the per-IP limit: a tight
   * per-account limit lets anyone lock a known attorney out of their own file by
   * failing logins on their address. This catches distributed credential stuffing
   * without handing over that denial-of-service.
   */
  loginByAccount: { limit: 30, windowSeconds: 900 },

  /** Portal reads, per IP. Generous — a client refreshing the page is not an attack. */
  portalRead: { limit: 120, windowSeconds: 60 },

  /** Portal uploads, per invite. */
  portalUpload: { limit: 30, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>;
