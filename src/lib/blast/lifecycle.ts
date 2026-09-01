import "server-only";

import { prisma } from "@/lib/db/prisma";
import { forbidden, invalidState, notFound } from "@/lib/errors";
import { cancelOutstanding } from "@/lib/delivery/record-result";
import { releaseClaims } from "@/lib/delivery/recipient-claim";
import {
  blastJobProgress,
  deriveTerminalStatus,
} from "@/lib/delivery/progress";
import { logger } from "@/lib/observability/logger";
import { recordAudit } from "@/lib/audit/service";

/**
 * Blast-job lifecycle transitions (RULES.md §11).
 *
 * A USER may pause/resume/stop only their own job, and only when the campaign
 * policy snapshotted on the job permits it. An ADMIN may force-stop any job with
 * a reason, which is always audited.
 */

const PAUSABLE = ["QUEUED", "RUNNING"] as const;
const RESUMABLE = ["PAUSED"] as const;
const STOPPABLE = ["PENDING", "QUEUED", "RUNNING", "PAUSED"] as const;

async function loadJob(blastJobId: string) {
  const job = await prisma.blastJob.findUnique({
    where: { id: blastJobId },
    select: {
      id: true,
      userId: true,
      status: true,
      snapshotAllowUserPause: true,
      campaignId: true,
    },
  });

  if (!job) {
    throw notFound("This blast job no longer exists.");
  }
  return job;
}

/** Pauses a job. Workers observe the status change before the next send. */
export async function pauseBlastJob(params: {
  blastJobId: string;
  actorUserId: string;
  actorRole: "ADMIN" | "USER";
}): Promise<void> {
  const job = await loadJob(params.blastJobId);

  if (params.actorRole === "USER") {
    if (job.userId !== params.actorUserId) {
      throw forbidden("You can only control your own blast jobs.");
    }
    if (!job.snapshotAllowUserPause) {
      throw forbidden("This campaign does not allow pausing a running job.");
    }
  }

  const result = await prisma.blastJob.updateMany({
    where: { id: job.id, status: { in: [...PAUSABLE] } },
    data: { status: "PAUSED" },
  });

  if (result.count !== 1) {
    throw invalidState("This job can no longer be paused.");
  }

  logger("blast").info(
    { event: "blast.paused", blastJobId: job.id, actorRole: params.actorRole },
    "Blast job paused",
  );
}

/** Resumes a paused job and re-enqueues delivery. */
export async function resumeBlastJob(params: {
  blastJobId: string;
  actorUserId: string;
  actorRole: "ADMIN" | "USER";
}): Promise<void> {
  const job = await loadJob(params.blastJobId);

  if (params.actorRole === "USER" && job.userId !== params.actorUserId) {
    throw forbidden("You can only control your own blast jobs.");
  }

  // Resuming is only safe while the campaign itself is still active.
  const campaign = await prisma.campaign.findUnique({
    where: { id: job.campaignId },
    select: { status: true, scheduledEndAt: true },
  });

  if (!campaign || campaign.status !== "ACTIVE") {
    throw invalidState("The campaign is no longer active.");
  }
  if (campaign.scheduledEndAt < new Date()) {
    throw invalidState("The campaign schedule has ended.");
  }

  const result = await prisma.blastJob.updateMany({
    where: { id: job.id, status: { in: [...RESUMABLE] } },
    data: { status: "QUEUED" },
  });

  if (result.count !== 1) {
    throw invalidState("This job is not paused.");
  }

  // Imported lazily to keep the queue producer out of read-only paths.
  const { enqueueBlastDelivery } = await import("@/lib/queue/queues");
  await enqueueBlastDelivery({ blastJobId: job.id });
}

/**
 * Stops a job. Outstanding `PENDING`/`CLAIMED`/`RETRYABLE_FAILED` recipients are
 * cancelled; rows already in `SENDING` are left for reconciliation so a possibly
 * delivered message is never re-sent.
 */
export async function stopBlastJob(params: {
  blastJobId: string;
  actorUserId: string;
  actorRole: "ADMIN" | "USER";
  reason?: string;
}): Promise<void> {
  const job = await loadJob(params.blastJobId);

  if (params.actorRole === "USER" && job.userId !== params.actorUserId) {
    throw forbidden("You can only control your own blast jobs.");
  }

  await prisma.$transaction(async (tx) => {
    const result = await tx.blastJob.updateMany({
      where: { id: job.id, status: { in: [...STOPPABLE] } },
      data: {
        status: "CANCELLED",
        requestedStopAt: new Date(),
        finishedAt: new Date(),
        stoppedByRole: params.actorRole,
        stopReason: params.reason?.slice(0, 255) ?? null,
      },
    });

    if (result.count !== 1) {
      throw invalidState("This job has already finished.");
    }

    await releaseClaims({ blastJobId: job.id, tx });
    await cancelOutstanding({ blastJobId: job.id, tx });

    if (params.actorRole === "ADMIN") {
      await recordAudit(
        {
          actorUserId: params.actorUserId,
          actorRole: "ADMIN",
          action: "BLAST_JOB_FORCE_STOP",
          resourceType: "BLAST_JOB",
          resourceId: job.id,
          reason: params.reason,
          afterSummary: { status: "CANCELLED" },
        },
        tx,
      );
    }
  });

  logger("blast").info(
    { event: "blast.stopped", blastJobId: job.id, actorRole: params.actorRole },
    "Blast job stopped",
  );
}

/**
 * Finalises a job once no work remains. Called by the worker after a delivery
 * pass and by the maintenance sweep. Safe to call repeatedly.
 */
export async function finaliseIfComplete(
  blastJobId: string,
): Promise<"COMPLETED" | "PARTIAL_FAILED" | null> {
  const counts = await blastJobProgress(blastJobId);
  const terminal = deriveTerminalStatus(counts);

  if (!terminal) {
    return null;
  }

  await prisma.blastJob.updateMany({
    where: { id: blastJobId, status: { in: ["QUEUED", "RUNNING"] } },
    data: { status: terminal, finishedAt: new Date() },
  });

  return terminal;
}
