import "server-only";

import Redis, { type Redis as RedisClient } from "ioredis";

import { serverEnv } from "@/lib/env";

/**
 * Shared Redis connections.
 *
 * BullMQ requires `maxRetriesPerRequest: null` on the connections it owns, so
 * queue/worker connections are created separately from the general-purpose
 * client used for rate limiting and locks.
 */

const globalForRedis = globalThis as unknown as {
  redis?: RedisClient;
};

function createRedis(overrides?: Record<string, unknown>): RedisClient {
  const env = serverEnv();
  return new Redis(env.REDIS_URL, {
    lazyConnect: false,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    ...overrides,
  });
}

/** General-purpose client: rate limits, short-lived locks, cached counters. */
export function redis(): RedisClient {
  if (!globalForRedis.redis) {
    globalForRedis.redis = createRedis();
  }
  return globalForRedis.redis;
}

/**
 * Dedicated connection for BullMQ. Each queue/worker must own its connection,
 * so this always returns a new instance.
 */
export function createQueueConnection(): RedisClient {
  return createRedis({
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}
