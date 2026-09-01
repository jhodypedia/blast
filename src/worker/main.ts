import "dotenv/config";

import { Worker, type Job } from "bullmq";

import { QUEUE_NAMES } from "@/lib/constants";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/observability/logger";
import { createQueueConnection } from "@/lib/redis/client";
import { getQueue } from "@/lib/queue/queues";
import type {
  BlastDeliveryJobData,
  DeviceSessionJobData,
  MaintenanceJobData,
  TargetImportJobData,
} from "@/lib/queue/queues";
import { runBlastJob } from "@/worker/delivery-runner";
import { processTargetImport } from "@/worker/target-import-runner";
import { processDeviceSession } from "@/worker/device-session-runner";
import { processMaintenance } from "@/worker/maintenance-runner";

/**
 * Worker entry point (RULES.md §13).
 *
 * Runs as a separate process from the Next.js web app: `npm run worker`.
 * Deployment must keep the two independently restartable.
 */

const log = logger("worker");

function startWorkers() {
  const env = serverEnv();
  const concurrency = env.WORKER_CONCURRENCY;

  const deliveryWorker = new Worker<BlastDeliveryJobData>(
    QUEUE_NAMES.blastDelivery,
    async (job: Job<BlastDeliveryJobData>) => {
      await runBlastJob(job.data.blastJobId);
    },
    {
      connection: createQueueConnection(),
      concurrency,
      // Delivery is paced internally; a long lock renewal avoids false stalls.
      lockDuration: 120_000,
    },
  );

  const importWorker = new Worker<TargetImportJobData>(
    QUEUE_NAMES.targetImport,
    async (job: Job<TargetImportJobData>) => {
      await processTargetImport(job.data);
    },
    {
      connection: createQueueConnection(),
      concurrency: 2,
      lockDuration: 600_000,
    },
  );

  const deviceWorker = new Worker<DeviceSessionJobData>(
    QUEUE_NAMES.deviceSession,
    async (job: Job<DeviceSessionJobData>) => {
      await processDeviceSession(job.data);
    },
    {
      connection: createQueueConnection(),
      concurrency,
      lockDuration: 120_000,
    },
  );

  const maintenanceWorker = new Worker<MaintenanceJobData>(
    QUEUE_NAMES.maintenance,
    async (job: Job<MaintenanceJobData>) => {
      await processMaintenance(job.data);
    },
    {
      connection: createQueueConnection(),
      concurrency: 1,
    },
  );

  const workers = [
    deliveryWorker,
    importWorker,
    deviceWorker,
    maintenanceWorker,
  ];

  for (const worker of workers) {
    worker.on("failed", (job, error) => {
      log.error(
        {
          event: "queue.job_failed",
          queue: worker.name,
          jobId: job?.id,
          reason: error.message,
        },
        "Queue job failed",
      );
    });

    worker.on("error", (error) => {
      log.error(
        { event: "queue.worker_error", queue: worker.name, reason: error.message },
        "Queue worker error",
      );
    });
  }

  return workers;
}

/**
 * Registers the repeatable maintenance sweeps.
 *
 * BullMQ 6 uses job schedulers rather than the legacy `repeat` job option.
 * Upserting by a stable scheduler id makes this safe to call on every boot and
 * across multiple worker replicas.
 */
async function scheduleMaintenance(): Promise<void> {
  const queue = getQueue(QUEUE_NAMES.maintenance);

  const schedules: Array<{ task: MaintenanceJobData["task"]; every: number }> = [
    { task: "RECLAIM_STALE_LEASES", every: 60_000 },
    { task: "EXPIRE_CAMPAIGNS", every: 300_000 },
    { task: "SWEEP_DEVICES", every: 3_600_000 },
    { task: "PRUNE_LOGS", every: 86_400_000 },
  ];

  for (const schedule of schedules) {
    await queue.upsertJobScheduler(
      `maintenance:${schedule.task}`,
      { every: schedule.every },
      {
        name: QUEUE_NAMES.maintenance,
        data: { task: schedule.task },
        opts: { removeOnComplete: { count: 20 } },
      },
    );
  }
}

async function main(): Promise<void> {
  const workers = startWorkers();
  await scheduleMaintenance();

  log.info(
    { event: "worker.started", workerId: serverEnv().WORKER_ID },
    "Worker process started",
  );

  const shutdown = async (signal: string): Promise<void> => {
    log.info({ event: "worker.shutdown", signal }, "Shutting down workers");
    // Closing waits for in-flight jobs so claimed recipients are released or
    // recorded rather than abandoned mid-send.
    await Promise.all(workers.map((worker) => worker.close()));
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

void main().catch((error: unknown) => {
  log.error(
    {
      event: "worker.fatal",
      reason: error instanceof Error ? error.message : "unknown",
    },
    "Worker process failed to start",
  );
  process.exit(1);
});
