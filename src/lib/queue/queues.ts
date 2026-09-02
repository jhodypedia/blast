import "server-only";

import { Queue, type JobsOptions } from "bullmq";

import { QUEUE_NAMES, type QueueName } from "@/lib/constants";
import { createQueueConnection } from "@/lib/redis/client";

/**
 * Queue producers.
 *
 * The web process only ever enqueues; all execution happens in the separate
 * worker process (RULES.md §13). Queue instances are cached per name so hot
 * reloading does not leak Redis connections.
 */

export type TargetImportJobData = {
  targetListId: string;
  /** Absolute path inside the private storage root. */
  storageKey: string;
  defaultCountryCode: string;
};

export type BlastDeliveryJobData = {
  blastJobId: string;
};

export type DeviceSessionJobData = {
  deviceId: string;
  action: "CONNECT" | "DISCONNECT" | "REFRESH";
  /**
   * Pairing method for a CONNECT action. Set by the device service after it has
   * validated the owner, the policy, and (for pair codes) the phone number.
   */
  pairing?:
    | { method: "QR" }
    | { method: "PAIR_CODE"; normalizedNumber: string; customCode?: string };
};

export type MaintenanceJobData = {
  task:
    | "RECLAIM_STALE_LEASES"
    | "EXPIRE_CAMPAIGNS"
    | "PRUNE_LOGS"
    | "SWEEP_DEVICES";
};

export type QueuePayloads = {
  [QUEUE_NAMES.targetImport]: TargetImportJobData;
  [QUEUE_NAMES.blastDelivery]: BlastDeliveryJobData;
  [QUEUE_NAMES.deviceSession]: DeviceSessionJobData;
  [QUEUE_NAMES.maintenance]: MaintenanceJobData;
};

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { age: 3_600, count: 1_000 },
  removeOnFail: { age: 86_400 },
};

const globalForQueues = globalThis as unknown as {
  wablastQueues?: Map<string, Queue>;
};

function queueRegistry(): Map<string, Queue> {
  if (!globalForQueues.wablastQueues) {
    globalForQueues.wablastQueues = new Map();
  }
  return globalForQueues.wablastQueues;
}

/**
 * Returns the cached queue for `name`.
 *
 * The registry is intentionally untyped: BullMQ ties its generics to literal
 * job-name unions, which a shared map cannot express. Type safety is provided by
 * the {@link enqueue} wrapper and the per-queue helpers below, which are the only
 * supported way to add jobs.
 */
export function getQueue(name: QueueName): Queue {
  const registry = queueRegistry();
  const existing = registry.get(name);
  if (existing) {
    return existing;
  }

  const queue = new Queue(name, {
    connection: createQueueConnection(),
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });

  registry.set(name, queue);
  return queue;
}

/**
 * Enqueues a job with a deterministic job id where possible so a duplicate
 * client submission cannot create two runs of the same work.
 */
export async function enqueue<N extends QueueName>(
  name: N,
  data: QueuePayloads[N],
  options?: JobsOptions & { jobId?: string },
): Promise<void> {
  await getQueue(name).add(name, data, options);
}

export async function enqueueTargetImport(
  data: TargetImportJobData,
): Promise<void> {
  await enqueue(QUEUE_NAMES.targetImport, data, {
    jobId: `import-${data.targetListId}`,
    attempts: 1,
  });
}

export async function enqueueBlastDelivery(
  data: BlastDeliveryJobData,
): Promise<void> {
  await enqueue(QUEUE_NAMES.blastDelivery, data, {
    jobId: `blast-${data.blastJobId}`,
    attempts: 1,
  });
}

export async function enqueueDeviceSession(
  data: DeviceSessionJobData,
): Promise<void> {
  await enqueue(QUEUE_NAMES.deviceSession, data, {
    // Re-requesting a pairing must be able to supersede a stale attempt, so the
    // job id includes the action but not the pairing payload.
    jobId: `device-${data.deviceId}-${data.action}`,
    attempts: 1,
  });
}
