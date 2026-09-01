import "server-only";

import Redis, { type Redis as RedisClient } from "ioredis";

import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/observability/logger";
import { createCircuitBreaker } from "@/lib/redis/circuit";

/**
 * Shared Redis connections.
 *
 * BullMQ requires `maxRetriesPerRequest: null` on the connections it owns, so
 * queue/worker connections are created separately from the general-purpose
 * client used for rate limiting and caching.
 *
 * Two things this module guarantees:
 *
 * 1. Every connection has an `error` listener. Without one, ioredis re-emits
 *    connection failures as `[ioredis] Unhandled error event`, which on some
 *    Node versions escalates to an uncaught exception and kills the process.
 * 2. Callers that can degrade gracefully go through {@link withRedis}, which
 *    short-circuits through a breaker while Redis is down instead of paying the
 *    connect timeout on every single request.
 */

const globalForRedis = globalThis as unknown as {
  wablastRedis?: RedisClient;
};

/** Opens the breaker after 3 consecutive failures, retried at most every 10s. */
const breaker = createCircuitBreaker({ failureThreshold: 3, openMs: 10_000 });

function attachDiagnostics(client: RedisClient, label: string): RedisClient {
  const log = logger("queue");

  // Required: an unhandled 'error' event on an ioredis client is fatal.
  client.on("error", (error: Error) => {
    breaker.recordFailure();
    log.warn(
      {
        event: "redis.error",
        connection: label,
        reason: error.message,
        circuit: breaker.state(),
      },
      "Redis connection error",
    );
  });

  client.on("ready", () => {
    breaker.recordSuccess();
    log.info({ event: "redis.ready", connection: label }, "Redis connected");
  });

  client.on("end", () => {
    log.warn({ event: "redis.closed", connection: label }, "Redis connection closed");
  });

  return client;
}

function createRedis(
  label: string,
  overrides?: Record<string, unknown>,
): RedisClient {
  const env = serverEnv();

  const client = new Redis(env.REDIS_URL, {
    // Connect on first command so importing this module never blocks startup.
    lazyConnect: true,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    connectTimeout: 5_000,
    // Capped backoff; `null` would stop reconnecting permanently.
    retryStrategy: (attempt: number) => Math.min(attempt * 200, 5_000),
    ...overrides,
  });

  return attachDiagnostics(client, label);
}

/** General-purpose client: rate limits, short-lived locks, cached settings. */
export function redis(): RedisClient {
  if (!globalForRedis.wablastRedis) {
    globalForRedis.wablastRedis = createRedis("general");
  }
  return globalForRedis.wablastRedis;
}

/**
 * Dedicated connection for BullMQ. Each queue/worker must own its connection,
 * so this always returns a new instance.
 *
 * `maxRetriesPerRequest: null` is mandatory for BullMQ's blocking commands, and
 * queue connections deliberately do not use the breaker: a queue write that
 * cannot reach Redis must fail loudly rather than be silently dropped.
 */
export function createQueueConnection(): RedisClient {
  return createRedis("queue", {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
  });
}

/** True while the breaker is open, i.e. Redis is known to be unreachable. */
export function redisAvailable(): boolean {
  return breaker.allows();
}

/**
 * Runs `operation` against Redis, returning `fallback` when Redis is
 * unreachable.
 *
 * Use this only where Redis is a cache or an optimisation. Security controls
 * that must fail closed (rate limiting) have to inspect the failure themselves
 * rather than silently accepting the fallback.
 */
export async function withRedis<T>(
  operation: (client: RedisClient) => Promise<T>,
  fallback: T,
): Promise<T> {
  if (!breaker.allows()) {
    return fallback;
  }

  try {
    const result = await operation(redis());
    breaker.recordSuccess();
    return result;
  } catch {
    // The 'error' listener already recorded the failure and logged it.
    return fallback;
  }
}
