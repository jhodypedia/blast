import "server-only";

import { prisma } from "@/lib/db/prisma";
import { forbidden, notFound } from "@/lib/errors";
import {
  USER_DELIVERY_LOG_PAGE_SIZE,
  USER_DELIVERY_LOG_WINDOW_HOURS,
  type UserDeliveryLogStatus,
} from "@/lib/constants";
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
  deviceId: string;
  deviceLabel: string;
  /** Operator-visible `device-{userId}-{uuid}` identifier. */
  devicePublicId: string;
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
      deviceId: true,
      status: true,
      speedSeconds: true,
      quotaTotal: true,
      snapshotPayoutPerSend: true,
      snapshotCurrency: true,
      snapshotAllowUserPause: true,
      createdAt: true,
      finishedAt: true,
      campaign: { select: { name: true } },
      device: { select: { label: true, publicId: true } },
    },
  });

  return Promise.all(
    jobs.map(async (job) => {
      const progress = await blastJobProgress(job.id);

      return {
        id: job.id,
        campaignId: job.campaignId,
        campaignName: job.campaign.name,
        deviceId: job.deviceId,
        deviceLabel: job.device.label,
        devicePublicId: job.device.publicId,
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
      deviceId: true,
      status: true,
      speedSeconds: true,
      quotaTotal: true,
      snapshotPayoutPerSend: true,
      snapshotCurrency: true,
      snapshotAllowUserPause: true,
      createdAt: true,
      finishedAt: true,
      campaign: { select: { name: true } },
      device: { select: { label: true, publicId: true } },
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
      deviceId: job.deviceId,
      deviceLabel: job.device.label,
      devicePublicId: job.device.publicId,
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

/** Delivery statuses an operator may filter the log by. */
export type { UserDeliveryLogStatus } from "@/lib/constants";

export type DeviceBlastStatus = {
  deviceId: string;
  devicePublicId: string;
  deviceLabel: string;
  deviceStatus: "CONNECTING" | "CONNECTED" | "DISCONNECTED" | "EXPIRED" | "ERROR";
  lastErrorCode: string | null;
  /** Live job on this device, if any. */
  jobId: string | null;
  jobStatus:
    | "PENDING"
    | "QUEUED"
    | "RUNNING"
    | "PAUSED"
    | "COMPLETED"
    | "PARTIAL_FAILED"
    | "CANCELLED"
    | "FAILED"
    | null;
  /** Pause policy snapshotted on that job; false when there is no job. */
  allowUserPause: boolean;
  quotaTotal: number;
  sent: number;
  failed: number;
  pending: number;
  percent: number;
};

/**
 * Per-device delivery status for the operator's monitor panel.
 *
 * Devices are the primary rows so a slot with no job still appears; counts come
 * from the recipient rows of that device's most recent job.
 */
export async function listDeviceBlastStatus(
  userId: string,
): Promise<DeviceBlastStatus[]> {
  const devices = await prisma.device.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      publicId: true,
      label: true,
      status: true,
      lastErrorCode: true,
      blastJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          quotaTotal: true,
          snapshotAllowUserPause: true,
        },
      },
    },
  });

  return Promise.all(
    devices.map(async (device) => {
      const job = device.blastJobs[0] ?? null;
      const progress = job ? await blastJobProgress(job.id) : null;

      return {
        deviceId: device.id,
        devicePublicId: device.publicId,
        deviceLabel: device.label,
        deviceStatus: device.status,
        lastErrorCode: device.lastErrorCode,
        jobId: job?.id ?? null,
        jobStatus: job?.status ?? null,
        allowUserPause: job?.snapshotAllowUserPause ?? false,
        quotaTotal: job?.quotaTotal ?? 0,
        sent: progress?.sent ?? 0,
        failed: progress?.failed ?? 0,
        pending: progress ? progress.pending + progress.inFlight : 0,
        percent: progress ? completionPercent(progress) : 0,
      };
    }),
  );
}

export type UserDeliveryLogRow = {
  id: string;
  createdAt: Date;
  /** Operator-visible device id; null for rows written before per-device tracking. */
  devicePublicId: string | null;
  deviceLabel: string | null;
  /** Sanitised, non-reversible recipient reference (RULES.md §16). */
  recipientRef: string;
  status: string;
  event: string;
  detail: string | null;
  /** Message shape actually sent, from the job's immutable snapshot. */
  messageType: "TEXT" | "IMAGE" | "BUTTON";
  /** Delay used by the job that produced this row, in seconds. */
  speedSeconds: number;
};

/**
 * Reads the caller's delivery log for the rolling operator window.
 *
 * The window is enforced here rather than by deleting rows, so admin retention
 * stays independent of what an operator can see. Ownership is scoped through the
 * job relation, so no cross-tenant row can be returned.
 */
export async function listUserDeliveryLog(params: {
  userId: string;
  status?: UserDeliveryLogStatus;
  deviceId?: string;
  limit?: number;
}): Promise<UserDeliveryLogRow[]> {
  const since = new Date(
    Date.now() - USER_DELIVERY_LOG_WINDOW_HOURS * 60 * 60 * 1000,
  );

  const rows = await prisma.deliveryLog.findMany({
    where: {
      blastJob: { userId: params.userId },
      createdAt: { gte: since },
      ...(params.status ? { status: params.status } : {}),
      ...(params.deviceId ? { deviceId: params.deviceId } : {}),
    },
    orderBy: { id: "desc" },
    take: Math.min(params.limit ?? USER_DELIVERY_LOG_PAGE_SIZE, USER_DELIVERY_LOG_PAGE_SIZE),
    select: {
      id: true,
      createdAt: true,
      recipientRef: true,
      status: true,
      event: true,
      detail: true,
      device: { select: { label: true, publicId: true } },
      // The message shape and delay are read from the job snapshot rather than
      // duplicated onto every log row.
      blastJob: {
        select: { snapshotMessageType: true, speedSeconds: true },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id.toString(),
    createdAt: row.createdAt,
    devicePublicId: row.device?.publicId ?? null,
    deviceLabel: row.device?.label ?? null,
    recipientRef: row.recipientRef,
    status: row.status,
    event: row.event,
    detail: row.detail,
    messageType: row.blastJob.snapshotMessageType,
    speedSeconds: row.blastJob.speedSeconds,
  }));
}
