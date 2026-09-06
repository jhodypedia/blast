/**
 * Realtime event type definitions.
 *
 * Every event is keyed by a stable channel name so the publisher and subscriber
 * never drift. Values are JSON-serialisable payloads that are small enough to
 * pass through Redis Pub/Sub without truncation.
 */

// ── Channel constants ──────────────────────────────────────────────────────

export const REALTIME_CHANNELS = {
  /** Job-scoped: blast-job:{blastJobId} */
  blastJob: (blastJobId: string) => `blast-job:${blastJobId}` as const,

  /** Device-scoped: device:{deviceId} */
  device: (deviceId: string) => `device:${deviceId}` as const,

  /** User-scoped: user:{userId} */
  user: (userId: string) => `user:${userId}` as const,

  /** Admin broadcast channels */
  adminJobs: "admin:jobs" as const,
  adminTargets: "admin:targets" as const,
  adminWithdrawals: "admin:withdrawals" as const,
  adminUsers: "admin:users" as const,
} as const;

// ── Event payloads ─────────────────────────────────────────────────────────

export type BlastJobProgressEvent = {
  type: "blast-job:progress";
  blastJobId: string;
  userId: string;
  deviceId: string;
  status: string;
  sent: number;
  failed: number;
  pending: number;
  quotaTotal: number;
  percent: number;
};

export type BlastJobLifecycleEvent = {
  type: "blast-job:lifecycle";
  blastJobId: string;
  userId: string;
  deviceId: string;
  action: "PAUSED" | "RESUMED" | "STOPPED" | "COMPLETED" | "CANCELLED" | "FAILED";
  newStatus: string;
};

export type DeviceStatusEvent = {
  type: "device:status";
  deviceId: string;
  userId: string;
  status: string;
  maskedNumber?: string;
  lastErrorCode?: string;
};

export type AdminEvent = {
  type: "admin:refresh";
  resource: "jobs" | "targets" | "withdrawals" | "users";
  action: "created" | "updated" | "deleted";
  resourceId?: string;
};

export type RealtimeEvent =
  | BlastJobProgressEvent
  | BlastJobLifecycleEvent
  | DeviceStatusEvent
  | AdminEvent;

// ── Redis prefix ───────────────────────────────────────────────────────────

/** All realtime channels are namespaced under this prefix in Redis. */
export const REDIS_REALTIME_PREFIX = "realtime:";

export function toRedisChannel(channel: string): string {
  return `${REDIS_REALTIME_PREFIX}${channel}`;
}

export function fromRedisChannel(redisChannel: string): string {
  return redisChannel.startsWith(REDIS_REALTIME_PREFIX)
    ? redisChannel.slice(REDIS_REALTIME_PREFIX.length)
    : redisChannel;
}