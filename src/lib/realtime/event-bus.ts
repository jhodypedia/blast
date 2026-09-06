import "server-only";

import { redis } from "@/lib/redis/client";
import { logger } from "@/lib/observability/logger";
import {
  toRedisChannel,
  type BlastJobProgressEvent,
  type BlastJobLifecycleEvent,
  type DeviceStatusEvent,
  type AdminEvent,
  type RealtimeEvent,
} from "@/lib/realtime/types";

/**
 * Server-side realtime event bus.
 *
 * Publishes events to Redis Pub/Sub so the Socket.IO server (which subscribes
 * to the same channels) can forward them to connected browsers.
 *
 * Every publish is fire-and-forget: a Redis outage must never block a database
 * mutation or a worker send loop. Failures are logged and swallowed.
 */

const log = logger("realtime");

/**
 * Publish a typed event to its Redis channel.
 *
 * Safe to call from server actions, route handlers, and worker processes.
 * The Redis client is the general-purpose ioredis instance shared across the
 * codebase.
 */
export async function publishEvent(event: RealtimeEvent): Promise<void> {
  try {
    let channel: string;

    switch (event.type) {
      case "blast-job:progress":
      case "blast-job:lifecycle":
        channel = `blast-job:${event.blastJobId}`;
        break;
      case "device:status":
        channel = `device:${event.deviceId}`;
        break;
      case "admin:refresh":
        channel = `admin:${event.resource}`;
        break;
      default:
        // Safety net: unknown event types are not published.
        return;
    }

    const redisChannel = toRedisChannel(channel);
    const payload = JSON.stringify(event);

    await redis().publish(redisChannel, payload);
  } catch (error) {
    // Redis may be temporarily down; the circuit breaker in the Redis client
    // already logs the failure. Never throw from a publish call.
    log.warn(
      {
        event: "realtime.publish_failed",
        reason: error instanceof Error ? error.message : "unknown",
      },
      "Failed to publish realtime event",
    );
  }
}

// ── Convenience publishers ─────────────────────────────────────────────────

export async function publishBlastProgress(
  event: Omit<BlastJobProgressEvent, "type">,
): Promise<void> {
  await publishEvent({ type: "blast-job:progress", ...event });
}

export async function publishBlastLifecycle(
  event: Omit<BlastJobLifecycleEvent, "type">,
): Promise<void> {
  await publishEvent({ type: "blast-job:lifecycle", ...event });
}

export async function publishDeviceStatus(
  event: Omit<DeviceStatusEvent, "type">,
): Promise<void> {
  await publishEvent({ type: "device:status", ...event });
}

export async function publishAdminRefresh(
  event: Omit<AdminEvent, "type">,
): Promise<void> {
  await publishEvent({ type: "admin:refresh", ...event });
}