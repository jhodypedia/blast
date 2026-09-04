import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { rowLockClause } from "@/lib/db/locking";
import {
  conflict,
  forbidden,
  invalidState,
  notFound,
  validationError,
} from "@/lib/errors";
import { getSetting } from "@/lib/settings/service";
import { SETTING_KEYS, isAllowedSpeed } from "@/lib/constants";
import { recipientReference } from "@/lib/security/crypto";
import { enqueueBlastDelivery } from "@/lib/queue/queues";
import { logger } from "@/lib/observability/logger";

/**
 * Blast-job creation (RULES.md §11).
 *
 * Every eligibility rule is checked server-side against authoritative database
 * rows. The client supplies only a campaign id, a device id and a speed; payout,
 * content, quota and policy are read from the campaign and then snapshotted onto
 * the job so later admin edits cannot change an in-flight run.
 */

export type StartBlastJobInput = {
  /** From the verified session, never the request body. */
  userId: string;
  campaignId: string;
  deviceId: string;
  speedSeconds: number;
  acceptedTerms: boolean;
};

/**
 * Builds the deterministic submission key.
 *
 * Derived from the user, campaign, device and speed rather than a client-supplied
 * nonce, so a double-submitted form collapses onto a single job.
 */
function submissionKeyFor(input: StartBlastJobInput): string {
  return createHash("sha256")
    .update(
      [input.userId, input.campaignId, input.deviceId, input.speedSeconds].join(
        ":",
      ),
    )
    .digest("base64url")
    .slice(0, 64);
}

export type StartBlastJobResult = {
  blastJobId: string;
  quotaTotal: number;
  /** True when an existing in-flight job was returned instead of a new one. */
  deduplicated: boolean;
};

/** Job states that still occupy a concurrency/quota slot. */
const ACTIVE_JOB_STATUSES = ["PENDING", "QUEUED", "RUNNING", "PAUSED"] as const;


export async function startBlastJob(
  input: StartBlastJobInput,
): Promise<StartBlastJobResult> {
  const log = logger("blast");

  if (!isAllowedSpeed(input.speedSeconds)) {
    throw validationError("The selected sending speed is not allowed.", {
      speedSeconds: ["Choose 1, 3, 6 or 10 seconds"],
    });
  }

  const now = new Date();

  const [campaign, device, maxActiveJobs] = await Promise.all([
    prisma.campaign.findFirst({
      where: { id: input.campaignId, archivedAt: null },
      select: {
        id: true,
        status: true,
        messageText: true,
        mediaKey: true,
        mediaMime: true,
        mediaCaption: true,
        ctaLabel: true,
        ctaUrl: true,
        contentVersion: true,
        payoutPerSend: true,
        currency: true,
        quotaPerUser: true,
        retryLimit: true,
        allowUserPause: true,
        requireTermsAccept: true,
        allowedSpeeds: true,
        deviceModePolicy: true,
        assignmentPolicy: true,
        scheduledStartAt: true,
        scheduledEndAt: true,
        maxConcurrentJobs: true,
      },
    }),
    prisma.device.findFirst({
      where: { id: input.deviceId, deletedAt: null },
      select: { id: true, userId: true, status: true },
    }),
    getSetting(SETTING_KEYS.maxActiveJobsPerUser),
  ]);

  if (!campaign) {
    throw notFound("This campaign is no longer available.");
  }
  if (campaign.status !== "ACTIVE") {
    throw invalidState("This campaign is not currently active.");
  }
  if (now < campaign.scheduledStartAt || now > campaign.scheduledEndAt) {
    throw invalidState("This campaign is outside its scheduled window.");
  }

  // Ownership: the device must belong to the requesting user.
  if (!device || device.userId !== input.userId) {
    throw forbidden(
      "The selected device is not available.",
      `User ${input.userId} attempted to use device ${input.deviceId}`,
    );
  }
  if (device.status !== "CONNECTED") {
    throw invalidState("The selected device is not connected.");
  }

  // Speed must be inside the campaign's own allow-list, not just the global one.
  const allowedSpeeds = Array.isArray(campaign.allowedSpeeds)
    ? (campaign.allowedSpeeds as unknown[]).filter(
        (value): value is number => typeof value === "number",
      )
    : [];
  if (!allowedSpeeds.includes(input.speedSeconds)) {
    throw validationError(
      "The selected speed is not allowed for this campaign.",
      { speedSeconds: ["Choose one of the speeds offered by this campaign"] },
    );
  }

  if (campaign.requireTermsAccept && !input.acceptedTerms) {
    throw validationError("You must accept the campaign terms to continue.", {
      acceptedTerms: ["Acceptance is required for this campaign"],
    });
  }

  if (campaign.assignmentPolicy === "SELECTED_USERS") {
    const assignment = await prisma.campaignAssignment.findUnique({
      where: {
        campaignId_userId: { campaignId: campaign.id, userId: input.userId },
      },
      select: { id: true },
    });
    if (!assignment) {
      throw forbidden("This campaign is not assigned to your account.");
    }
  }

  const submissionKey = submissionKeyFor(input);

  const existing = await prisma.blastJob.findUnique({
    where: { userId_submissionKey: { userId: input.userId, submissionKey } },
    select: { id: true, status: true, quotaTotal: true },
  });

  if (
    existing &&
    (ACTIVE_JOB_STATUSES as readonly string[]).includes(existing.status)
  ) {
    // Idempotent: a duplicate submit returns the in-flight job.
    return {
      blastJobId: existing.id,
      quotaTotal: existing.quotaTotal,
      deduplicated: true,
    };
  }

  const [activeJobs, usedQuota, concurrentForCampaign] = await Promise.all([
    prisma.blastJob.count({
      where: { userId: input.userId, status: { in: [...ACTIVE_JOB_STATUSES] } },
    }),
    prisma.campaignRecipient.count({
      where: {
        campaignId: campaign.id,
        blastJob: { userId: input.userId },
        status: { not: "CANCELLED" },
      },
    }),
    prisma.blastJob.count({
      where: {
        campaignId: campaign.id,
        userId: input.userId,
        status: { in: [...ACTIVE_JOB_STATUSES] },
      },
    }),
  ]);

  if (activeJobs >= maxActiveJobs) {
    throw conflict(
      "You already have the maximum number of running jobs. Finish one before starting another.",
    );
  }

  const remainingQuota = campaign.quotaPerUser - usedQuota;
  if (remainingQuota <= 0) {
    throw conflict("You have reached your quota for this campaign.");
  }

  if (concurrentForCampaign >= campaign.maxConcurrentJobs) {
    throw conflict("You already have a running job for this campaign.");
  }

  const blastJobId = randomUUID();

  // Probed outside the transaction: the answer is cached per process and the
  // probe itself opens a transaction, so it must not run inside another one.
  const lockClause = await rowLockClause(prisma);

  const created = await prisma.$transaction(
    async (tx) => {
      // Allocate numbers from the campaign's target list that no recipient row
      // has claimed yet. The locking read keeps concurrent operators off the
      // same rows, and the unique (campaignId, normalizedNumber) constraint is
      // the final guarantee of one row per number per campaign.
      const available = await tx.$queryRaw<
        Array<{ normalizedNumber: string }>
      >(Prisma.sql`
        SELECT tn.normalizedNumber AS normalizedNumber
        FROM TargetNumber tn
        JOIN Campaign c ON c.targetListId = tn.targetListId
        LEFT JOIN CampaignRecipient cr
          ON cr.campaignId = c.id
         AND cr.normalizedNumber = tn.normalizedNumber
        WHERE c.id = ${campaign.id}
          AND cr.id IS NULL
        ORDER BY tn.id ASC
        LIMIT ${remainingQuota}
        ${lockClause}
      `);

      if (available.length === 0) {
        throw conflict("There are no recipients left for this campaign.");
      }

      const job = await tx.blastJob.create({
        data: {
          id: blastJobId,
          campaignId: campaign.id,
          userId: input.userId,
          deviceId: device.id,
          status: "QUEUED",
          submissionKey,
          snapshotContentVersion: campaign.contentVersion,
          snapshotMessageText: campaign.messageText,
          snapshotMediaKey: campaign.mediaKey,
          snapshotMediaMime: campaign.mediaMime,
          snapshotMediaCaption: campaign.mediaCaption,
          snapshotCtaLabel: campaign.ctaLabel,
          snapshotCtaUrl: campaign.ctaUrl,
          snapshotPayoutPerSend: campaign.payoutPerSend,
          snapshotCurrency: campaign.currency,
          snapshotDeviceMode: campaign.deviceModePolicy,
          snapshotRetryLimit: campaign.retryLimit,
          snapshotAllowUserPause: campaign.allowUserPause,
          speedSeconds: input.speedSeconds,
          quotaTotal: available.length,
        },
        select: { id: true },
      });

      await tx.campaignRecipient.createMany({
        data: available.map((row) => ({
          campaignId: campaign.id,
          blastJobId: job.id,
          normalizedNumber: row.normalizedNumber,
          recipientRef: recipientReference(campaign.id, row.normalizedNumber),
          idempotencyKey: `send:${campaign.id}:${row.normalizedNumber}`,
        })),
        skipDuplicates: true,
      });

      // A concurrent operator may have taken some rows first; align the snapshot
      // with what was actually allocated so progress maths stays correct.
      const allocated = await tx.campaignRecipient.count({
        where: { blastJobId: job.id },
      });

      if (allocated === 0) {
        throw conflict("There are no recipients left for this campaign.");
      }

      if (allocated !== available.length) {
        await tx.blastJob.update({
          where: { id: job.id },
          data: { quotaTotal: allocated },
        });
      }

      return { id: job.id, quotaTotal: allocated };
    },
    { timeout: 20_000 },
  );

  await enqueueBlastDelivery({ blastJobId: created.id });

  log.info(
    {
      event: "blast.job_created",
      blastJobId: created.id,
      campaignId: campaign.id,
      userId: input.userId,
      quotaTotal: created.quotaTotal,
    },
    "Blast job queued",
  );

  return {
    blastJobId: created.id,
    quotaTotal: created.quotaTotal,
    deduplicated: false,
  };
}
