import "server-only";

import { prisma } from "@/lib/db/prisma";
import { forbidden, notFound } from "@/lib/errors";
import {
  blastJobProgress,
  completionPercent,
  type ProgressCounts,
} from "@/lib/delivery/progress";

/**
 * Read-only blast-job queries for operator screens.
 *
 * Progress is always derived from recipient rows, and no projection here exposes
 * a recipient's phone number — only the non-reversible `recipientRef`.
 */

export type UserJobSummary = {
  id: string;
  campaignId: string;
  campaignName: string;
  deviceLabel: string;
  status:
    | "PENDING"
    | "QUEUED"
    | "RUNNING"
    | "PAUSED"
    | "COMPLETED"
    | "PARTIAL_FAILED"
    | "CANCELLED"
    | "FAILED";
  speedSeconds: number;
  quotaTotal: number;
  payoutPerSend: string;
  currency: string;
  allowUserPause: boolean;
  createdAt: Date;
  finishedAt: Date | null;
  progress: ProgressCounts;
  percent: number;
};

const LIVE_STATUSES = ["PENDING", "QUEUED", "RUNNING", "PAUSED"] as const;

/** Lists the caller's own jobs, newest first. */
export async function listUserJobs(
  userId: string,
  options?: { onlyLive?: boolean; limit?: number },
): Promise<UserJobSummary[]> {
  const jobs = await prisma.blastJob.findMany({
    where: {
      userId,
      ...(options?.onlyLive ? { status: { in: [...LIVE_STATUSES] } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(options?.limit ?? 20, 100),
    select: {
      id: true,
      campaignId: true,
      status: true,
      speedSeconds: true,
      quotaTotal: true,
      snapshotPayoutPerSend: true,
      snapshotCurrency: true,
      snapshotAllowUserPause: true,
      createdAt: true,
      finishedAt: true,
      campaign: { select: { name: true } },
      device: { select: { label: true } },
    },
  });

  return Promise.all(
    jobs.map(async (job) => {
      const progress = await blastJobProgress(job.id);

      return {
        id: job.id,
        campaignId: job.campaignId,
        campaignName: job.campaign.name,
        deviceLabel: job.device.label,
        status: job.status,
        speedSeconds: job.speedSeconds,
        quotaTotal: job.quotaTotal,
        payoutPerSend: job.snapshotPayoutPerSend.toString(),
        currency: job.snapshotCurrency,
        allowUserPause: job.snapshotAllowUserPause,
        createdAt: job.createdAt,
        finishedAt: job.finishedAt,
        progress,
        percent: completionPercent(progress),
      };
    }),
  );
}

/** Loads one job the caller owns, with its masked recent delivery events. */
export async function getUserJobDetail(params: {
  userId: string;
  blastJobId: string;
}): Promise<{
  job: UserJobSummary;
  events: Array<{
    recipientRef: string;
    event: string;
    status: string;
    createdAt: Date;
  }>;
}> {
  const job = await prisma.blastJob.findUnique({
    where: { id: params.blastJobId },
    select: {
      id: true,
      userId: true,
      campaignId: true,
      status: true,
      speedSeconds: true,
      quotaTotal: true,
      snapshotPayoutPerSend: true,
      snapshotCurrency: true,
      snapshotAllowUserPause: true,
      createdAt: true,
      finishedAt: true,
      campaign: { select: { name: true } },
      device: { select: { label: true } },
    },
  });

  if (!job) {
    throw notFound("This blast job no longer exists.");
  }
  if (job.userId !== params.userId) {
    throw forbidden("You can only view your own blast jobs.");
  }

  const [progress, logs] = await Promise.all([
    blastJobProgress(job.id),
    prisma.deliveryLog.findMany({
      where: { blastJobId: job.id },
      orderBy: { id: "desc" },
      take: 50,
      // `recipientRef` is a non-reversible reference, never the number itself.
      select: {
        recipientRef: true,
        event: true,
        status: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    job: {
      id: job.id,
      campaignId: job.campaignId,
      campaignName: job.campaign.name,
      deviceLabel: job.device.label,
      status: job.status,
      speedSeconds: job.speedSeconds,
      quotaTotal: job.quotaTotal,
      payoutPerSend: job.snapshotPayoutPerSend.toString(),
      currency: job.snapshotCurrency,
      allowUserPause: job.snapshotAllowUserPause,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt,
      progress,
      percent: completionPercent(progress),
    },
    events: logs,
  };
}
