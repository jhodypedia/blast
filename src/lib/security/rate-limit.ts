import "server-only";

import { redis } from "@/lib/redis/client";
import { rateLimited } from "@/lib/errors";

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
 */
export async function consumeRateLimit(
  rule: RateLimitRule,
  identifier: string,
): Promise<RateLimitResult> {
  const key = `rl:${rule.name}:${identifier}`;
  const client = redis();

  const pipeline = client.multi();
  pipeline.incr(key);
  pipeline.ttl(key);
  const results = await pipeline.exec();

  if (!results) {
    // Fail closed: if Redis is unavailable we do not silently drop protection.
    return { allowed: false, remaining: 0, retryAfterSeconds: rule.windowSeconds };
  }

  const count = Number(results[0]?.[1] ?? 0);
  let ttl = Number(results[1]?.[1] ?? -1);

  if (ttl < 0) {
    await client.expire(key, rule.windowSeconds);
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

/** Clears a window, e.g. after a successful login. */
export async function resetRateLimit(
  rule: RateLimitRule,
  identifier: string,
): Promise<void> {
  await redis().del(`rl:${rule.name}:${identifier}`);
}
