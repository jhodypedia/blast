import "server-only";

import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/logger";
import { reclaimExpiredClaims } from "@/lib/delivery/recipient-claim";
import { finaliseIfComplete } from "@/lib/blast/lifecycle";
import { getSetting } from "@/lib/settings/service";
import {
  OPERATIONAL_LOG_RETENTION_DAYS,
  SENDING_STALE_MS,
  SETTING_KEYS,
} from "@/lib/constants";
import type { MaintenanceJobData } from "@/lib/queue/queues";

/**
 * Maintenance tasks (RULES.md §12, §16, §21).
 *
 * All sweeps are chunked and idempotent so they can run on a schedule without
 * risking database pressure or double-processing.
 */

const CHUNK = 500;

/**
 * Returns expired `CLAIMED` leases to `PENDING` and escalates stale `SENDING`
 * rows to reconciliation. A `SENDING` row is never re-queued: the message may
 * already have been delivered.
 */
async function reclaimStaleLeases(): Promise<void> {
  const log = logger("cleanup");

  const reclaimed = await reclaimExpiredClaims(CHUNK);

  const staleBefore = new Date(Date.now() - SENDING_STALE_MS);
  const stale = await prisma.campaignRecipient.findMany({
    where: {
      status: "SENDING",
      OR: [
        { leaseExpiresAt: { lt: new Date() } },
        { lastAttemptAt: { lt: staleBefore } },
      ],
    },
    select: { id: true, blastJobId: true },
    take: CHUNK,
  });

  for (const row of stale) {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.campaignRecipient.updateMany({
        where: { id: row.id, status: "SENDING" },
        data: {
          status: "RECONCILIATION_REQUIRED",
          failureCategory: "STALE_SENDING_LEASE",
          failureReason:
            "The worker stopped before the delivery outcome was recorded",
          workerId: null,
          leaseExpiresAt: null,
        },
      });

      if (updated.count === 1 && row.blastJobId) {
        await tx.reconciliationEvent.create({
          data: {
            blastJobId: row.blastJobId,
            recipientId: row.id,
            reason: "STALE_SENDING_LEASE",
            detail:
              "Lease expired while the recipient was in SENDING; outcome unknown.",
          },
        });
      }
    });
  }

  if (reclaimed > 0 || stale.length > 0) {
    log.info(
      {
        event: "cleanup.leases",
        reclaimed,
        escalated: stale.length,
      },
      "Stale lease sweep completed",
    );
  }
}

/** Expires campaigns whose schedule window has closed. */
async function expireCampaigns(): Promise<void> {
  const now = new Date();

  const expired = await prisma.campaign.updateMany({
    where: {
      status: { in: ["SCHEDULED", "ACTIVE", "PAUSED"] },
      scheduledEndAt: { lt: now },
    },
    data: { status: "EXPIRED", completedAt: now },
  });

  if (expired.count === 0) {
    return;
  }

  // Finalise any jobs that were left open by the expiry.
  const openJobs = await prisma.blastJob.findMany({
    where: { status: { in: ["QUEUED", "RUNNING"] } },
    select: { id: true },
    take: CHUNK,
  });

  for (const job of openJobs) {
    await finaliseIfComplete(job.id);
  }

  logger("cleanup").info(
    { event: "cleanup.campaigns_expired", count: expired.count },
    "Campaigns expired",
  );
}

/** Prunes delivery and operational logs according to the retention policy. */
async function pruneLogs(): Promise<void> {
  const retentionDays = await getSetting(SETTING_KEYS.deliveryLogRetentionDays);

  const deliveryCutoff = new Date(
    Date.now() - retentionDays * 24 * 60 * 60 * 1000,
  );
  const operationalCutoff = new Date(
    Date.now() - OPERATIONAL_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );

  // Chunked deletes keep the transaction log small.
  let removed = 0;
  for (;;) {
    const batch = await prisma.deliveryLog.findMany({
      where: { createdAt: { lt: deliveryCutoff } },
      select: { id: true },
      take: CHUNK,
    });
    if (batch.length === 0) {
      break;
    }
    const result = await prisma.deliveryLog.deleteMany({
      where: { id: { in: batch.map((row) => row.id) } },
    });
    removed += result.count;
    if (batch.length < CHUNK) {
      break;
    }
  }

  const operational = await prisma.operationalLog.deleteMany({
    where: { createdAt: { lt: operationalCutoff } },
  });

  logger("cleanup").info(
    {
      event: "cleanup.logs_pruned",
      deliveryLogs: removed,
      operationalLogs: operational.count,
    },
    "Log retention sweep completed",
  );
}

/** Marks long-idle devices as expired so users are prompted to re-pair. */
async function sweepDevices(): Promise<void> {
  const inactivityDays = await getSetting(SETTING_KEYS.deviceInactivityDays);
  const cutoff = new Date(Date.now() - inactivityDays * 24 * 60 * 60 * 1000);

  const result = await prisma.device.updateMany({
    where: {
      deletedAt: null,
      status: { in: ["DISCONNECTED", "ERROR"] },
      OR: [{ lastSeenAt: { lt: cutoff } }, { lastSeenAt: null, createdAt: { lt: cutoff } }],
    },
    data: { status: "EXPIRED" },
  });

  if (result.count > 0) {
    logger("cleanup").info(
      { event: "cleanup.devices_expired", count: result.count },
      "Idle devices marked expired",
    );
  }
}

export async function processMaintenance(
  data: MaintenanceJobData,
): Promise<void> {
  switch (data.task) {
    case "RECLAIM_STALE_LEASES":
      await reclaimStaleLeases();
      return;
    case "EXPIRE_CAMPAIGNS":
      await expireCampaigns();
      return;
    case "PRUNE_LOGS":
      await pruneLogs();
      return;
    case "SWEEP_DEVICES":
      await sweepDevices();
      return;
  }
}
