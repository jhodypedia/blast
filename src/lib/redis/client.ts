import "server-only";

import Redis, { type Redis as RedisClient } from "ioredis";

import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/observability/logger";
import { createCircuitBreaker } from "@/lib/redis/circuit";
import { reconnectDelay, MAX_RECONNECT_DELAY_MS } from "@/lib/redis/reconnect";

/**
 * Shared Redis connections.
 *
 * BullMQ requires `maxRetriesPerRequest: null` on the connections it owns, so
 * queue/worker connections are created separately from the general-purpose
 * client used for rate limiting and caching.
 *
 * Three things this module guarantees:
 *
 * 1. Every connection has an `error` listener. Without one, ioredis re-emits
 *    connection failures as `[ioredis] Unhandled error event`, which on some
 *    Node versions escalates to an uncaught exception and kills the process.
 * 2. Callers that can degrade gracefully go through {@link withRedis}, which
 *    short-circuits through a breaker while Redis is down instead of paying the
 *    connect timeout on every single request.
 * 3. The general-purpose client stops reconnecting after a bounded number of
 *    attempts, so an unreachable Redis cannot produce an unbounded log flood.
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
    log.warn(
      { event: "redis.closed", connection: label },
      "Redis connection closed",
    );
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
    retryStrategy: (attempt: number) => reconnectDelay(attempt),
    ...overrides,
  });

  return attachDiagnostics(client, label);
}

/** General-purpose client: rate limits, short-lived locks, cached settings. */
export function redis(): RedisClient {
  const existing = globalForRedis.wablastRedis;

  // `end` means the bounded reconnect policy gave up; every further command on
  // that instance rejects with "Connection is closed", so replace it. Callers
  // reach this path through the breaker, so a dead Redis is still only retried
  // once per open window.
  if (existing && existing.status !== "end") {
    return existing;
  }

  existing?.removeAllListeners();
  globalForRedis.wablastRedis = createRedis("general");
  return globalForRedis.wablastRedis;
}

/**
 * Dedicated connection for BullMQ. Each queue/worker must own its connection,
 * so this always returns a new instance.
 *
 * `maxRetriesPerRequest: null` is mandatory for BullMQ's blocking commands, and
 * queue connections deliberately do not use the breaker: a queue write that
 * cannot reach Redis must fail loudly rather than be silently dropped. They also
 * keep reconnecting indefinitely, because a worker is expected to wait for Redis
 * to come back rather than give up.
 */
export function createQueueConnection(): RedisClient {
  return createRedis("queue", {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (attempt: number) =>
      Math.min(attempt * 200, MAX_RECONNECT_DELAY_MS),
  });
}

/** True while the breaker allows calls, i.e. Redis is not known to be down. */
export function redisAvailable(): boolean {
  return breaker.allows();
}

/**
 * One-shot connectivity probe on a throwaway connection.
 *
 * Used as a startup preflight. Queue connections retry forever and re-emit each
 * failure per queue, so a worker started against an unreachable Redis produces
 * an unreadable error storm instead of one actionable message.
 */
export async function checkRedisReachable(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  const env = serverEnv();

  const probe = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    enableReadyCheck: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 3_000,
    // No reconnection: one attempt, then report.
    retryStrategy: () => null,
  });

  // With retries disabled ioredis rejects `connect()` with "Connection is
  // closed", which hides the real cause, so keep the first socket error.
  let socketError: string | null = null;
  probe.on("error", (error: Error) => {
    socketError ??= error.message;
  });

  try {
    await probe.connect();
    const reply = await probe.ping();
    if (reply !== "PONG") {
      return { ok: false, reason: `unexpected PING reply: ${reply}` };
    }
    breaker.recordSuccess();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason:
        socketError ??
        (error instanceof Error ? error.message : "unknown error"),
    };
  } finally {
    probe.disconnect();
  }
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
