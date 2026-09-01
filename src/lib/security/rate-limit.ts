import "server-only";

import { redis, redisAvailable, withRedis } from "@/lib/redis/client";
import { rateLimited } from "@/lib/errors";
import { logger } from "@/lib/observability/logger";

/**
 * Redis-backed fixed-window rate limiting for login, registration, password
 * reset, pairing, withdrawal and other sensitive mutations (RULES.md §9).
 *
 * The counter is incremented atomically and the TTL is only set on the first
 * hit of a window, so a burst cannot extend its own window.
 */

export type RateLimitRule = {
  /** Stable identifier, used as the Redis key prefix. */
  name: string;
  /** Maximum number of attempts allowed inside the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
};

export const RATE_LIMITS = {
  login: { name: "login", limit: 5, windowSeconds: 300 },
  register: { name: "register", limit: 3, windowSeconds: 3600 },
  passwordReset: { name: "pwreset", limit: 3, windowSeconds: 3600 },
  passwordChange: { name: "pwchange", limit: 5, windowSeconds: 900 },
  devicePairing: { name: "pairing", limit: 5, windowSeconds: 600 },
  deviceCreate: { name: "device-create", limit: 10, windowSeconds: 3600 },
  withdrawalRequest: { name: "withdrawal", limit: 3, windowSeconds: 3600 },
  walletSet: { name: "wallet-set", limit: 3, windowSeconds: 3600 },
  blastStart: { name: "blast-start", limit: 20, windowSeconds: 3600 },
  targetUpload: { name: "target-upload", limit: 20, windowSeconds: 3600 },
  adminMutation: { name: "admin-mutation", limit: 120, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Consumes one unit from the window for `identifier` under `rule`.
 * `identifier` must be a server-derived value (user id or hashed IP).
 *
 * This is a security control, so it fails **closed**: if Redis is unreachable
 * the request is denied rather than silently allowed. That is deliberate — the
 * alternative would let an attacker disable rate limiting by taking Redis down.
 */
export async function consumeRateLimit(
  rule: RateLimitRule,
  identifier: string,
): Promise<RateLimitResult> {
  const denied: RateLimitResult = {
    allowed: false,
    remaining: 0,
    retryAfterSeconds: rule.windowSeconds,
  };

  // Breaker already open: skip the connect timeout and deny immediately.
  if (!redisAvailable()) {
    logger("security").error(
      { event: "ratelimit.unavailable", rule: rule.name },
      "Rate limiting unavailable; denying request",
    );
    return denied;
  }

  const key = `rl:${rule.name}:${identifier}`;
  const client = redis();

  let results: [error: Error | null, result: unknown][] | null;
  try {
    const pipeline = client.multi();
    pipeline.incr(key);
    pipeline.ttl(key);
    results = await pipeline.exec();
  } catch (error) {
    logger("security").error(
      {
        event: "ratelimit.failed",
        rule: rule.name,
        reason: error instanceof Error ? error.message : "unknown",
      },
      "Rate limit check failed; denying request",
    );
    return denied;
  }

  if (!results) {
    return denied;
  }

  const count = Number(results[0]?.[1] ?? 0);
  let ttl = Number(results[1]?.[1] ?? -1);

  if (ttl < 0) {
    // First hit of the window; the TTL is only ever set here so a burst cannot
    // extend its own window. Best-effort: a failure leaves the key without a
    // TTL, which the next call repairs.
    await withRedis((c) => c.expire(key, rule.windowSeconds), 0);
    ttl = rule.windowSeconds;
  }

  const allowed = count <= rule.limit;

  return {
    allowed,
    remaining: Math.max(rule.limit - count, 0),
    retryAfterSeconds: allowed ? 0 : ttl,
  };
}

/** Consumes a unit and throws a rate-limit `AppError` when exhausted. */
export async function enforceRateLimit(
  rule: RateLimitRule,
  identifier: string,
): Promise<void> {
  const result = await consumeRateLimit(rule, identifier);
  if (!result.allowed) {
    throw rateLimited(result.retryAfterSeconds);
  }
}

/**
 * Clears a window, e.g. after a successful login. Best-effort: failure only
 * means the caller keeps its existing (stricter) counter until the TTL expires.
 */
export async function resetRateLimit(
  rule: RateLimitRule,
  identifier: string,
): Promise<void> {
  await withRedis((client) => client.del(`rl:${rule.name}:${identifier}`), 0);
}
