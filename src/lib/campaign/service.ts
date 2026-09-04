import "server-only";

import { prisma } from "@/lib/db/prisma";
import { conflict, invalidState, notFound, validationError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit/service";
import { toMoneyString } from "@/lib/money";
import { isAllowedSpeed } from "@/lib/constants";
import type {
  CampaignTransitionInput,
  CreateCampaignInput,
  UpdateCampaignInput,
} from "@/lib/validation/campaign";

/**
 * Campaign service — ADMIN only (RULES.md §6).
 *
 * Every mutation here is reachable only from an admin-guarded action. A USER has
 * no code path that can create or modify a campaign; the USER-facing read below
 * returns a deliberately narrow projection with no target data.
 */

/** Content fields whose change must bump `contentVersion`. */
function contentChanged(
  before: {
    messageText: string;
    mediaKey: string | null;
    mediaMime: string | null;
    mediaCaption: string | null;
    ctaLabel: string | null;
    ctaUrl: string | null;
  },
  after: UpdateCampaignInput,
): boolean {
  return (
    before.messageText !== after.messageText ||
    (before.mediaKey ?? null) !== (after.mediaKey ?? null) ||
    (before.mediaMime ?? null) !== (after.mediaMime ?? null) ||
    (before.mediaCaption ?? null) !== (after.mediaCaption ?? null) ||
    (before.ctaLabel ?? null) !== (after.ctaLabel ?? null) ||
    (before.ctaUrl ?? null) !== (after.ctaUrl ?? null)
  );
}

/** Fields an admin may never change once the campaign has recipients. */
const LOCKED_AFTER_DELIVERY = ["targetListId", "payoutPerSend", "currency"] as const;

async function assertTargetListUsable(targetListId: string): Promise<void> {
  const list = await prisma.targetList.findFirst({
    where: { id: targetListId, archivedAt: null },
    select: { status: true, importedCount: true },
  });

  if (!list) {
    throw validationError("Select an available target list.", {
      targetListId: ["This target list is not available"],
    });
  }
  if (list.status !== "READY") {
    throw validationError("The target list is still being processed.", {
      targetListId: ["Wait until the import has finished"],
    });
  }
  if (list.importedCount === 0) {
    throw validationError("The target list has no usable numbers.", {
      targetListId: ["This list imported zero valid numbers"],
    });
  }
}

function assertSpeeds(speeds: number[]): void {
  if (!speeds.every((speed) => isAllowedSpeed(speed))) {
    throw validationError("Allowed speeds must be 1, 3, 6 or 10 seconds.", {
      allowedSpeeds: ["Choose from 1, 3, 6 or 10 seconds"],
    });
  }
}

export async function createCampaign(params: {
  adminUserId: string;
  input: CreateCampaignInput;
  ip?: string;
}): Promise<{ campaignId: string }> {
  const { input } = params;

  assertSpeeds(input.allowedSpeeds);
  await assertTargetListUsable(input.targetListId);

  const campaign = await prisma.$transaction(async (tx) => {
    const created = await tx.campaign.create({
      data: {
        name: input.name,
        description: input.description,
        internalNotes: input.internalNotes ?? null,
        createdByAdminId: params.adminUserId,
        status: "DRAFT",
        messageText: input.messageText,
        mediaKey: input.mediaKey ?? null,
        mediaMime: input.mediaMime ?? null,
        mediaCaption: input.mediaCaption ?? null,
        ctaLabel: input.ctaLabel ?? null,
        ctaUrl: input.ctaUrl ?? null,
        targetListId: input.targetListId,
        deviceModePolicy: input.deviceModePolicy,
        allowedSpeeds: input.allowedSpeeds,
        payoutPerSend: toMoneyString(input.payoutPerSend),
        currency: input.currency,
        quotaPerUser: input.quotaPerUser,
        maxConcurrentJobs: input.maxConcurrentJobs,
        assignmentPolicy: input.assignmentPolicy,
        allowUserPause: input.allowUserPause,
        requireTermsAccept: input.requireTermsAccept,
        retryLimit: input.retryLimit,
        scheduledStartAt: input.scheduledStartAt,
        scheduledEndAt: input.scheduledEndAt,
      },
      select: { id: true },
    });

    if (input.assignmentPolicy === "SELECTED_USERS") {
      await tx.campaignAssignment.createMany({
        data: input.assignedUserIds.map((userId) => ({
          campaignId: created.id,
          userId,
        })),
        skipDuplicates: true,
      });
    }

    await recordAudit(
      {
        actorUserId: params.adminUserId,
        actorRole: "ADMIN",
        action: "CAMPAIGN_CREATE",
        resourceType: "CAMPAIGN",
        resourceId: created.id,
        afterSummary: {
          name: input.name,
          targetListId: input.targetListId,
          payoutPerSend: toMoneyString(input.payoutPerSend),
          quotaPerUser: input.quotaPerUser,
          assignmentPolicy: input.assignmentPolicy,
        },
        ip: params.ip,
      },
      tx,
    );

    return created;
  });

  return { campaignId: campaign.id };
}

/**
 * Updates a campaign.
 *
 * Payout, currency and target list are frozen once any recipient row exists, so
 * an in-flight campaign cannot have its economics rewritten underneath running
 * jobs. A content change bumps `contentVersion`; jobs already running keep their
 * snapshot.
 */
export async function updateCampaign(params: {
  adminUserId: string;
  campaignId: string;
  input: UpdateCampaignInput;
  ip?: string;
}): Promise<void> {
  const { input } = params;

  assertSpeeds(input.allowedSpeeds);

  const before = await prisma.campaign.findFirst({
    where: { id: params.campaignId, archivedAt: null },
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
      targetListId: true,
      payoutPerSend: true,
      currency: true,
      assignmentPolicy: true,
      _count: { select: { recipients: true } },
    },
  });

  if (!before) {
    throw notFound("This campaign no longer exists.");
  }
  if (before.status === "ARCHIVED" || before.status === "CANCELLED") {
    throw invalidState("A cancelled or archived campaign cannot be edited.");
  }

  const hasDeliveryHistory = before._count.recipients > 0;

  if (hasDeliveryHistory) {
    const changedLockedField =
      before.targetListId !== input.targetListId ||
      before.payoutPerSend.toString() !== toMoneyString(input.payoutPerSend) ||
      before.currency !== input.currency;

    if (changedLockedField) {
      throw invalidState(
        `Recipients already exist for this campaign, so ${LOCKED_AFTER_DELIVERY.join(", ")} can no longer change.`,
      );
    }
  } else if (before.targetListId !== input.targetListId) {
    await assertTargetListUsable(input.targetListId);
  }

  const bumpsContent = contentChanged(before, input);

  await prisma.$transaction(async (tx) => {
    await tx.campaign.update({
      where: { id: before.id },
      data: {
        name: input.name,
        description: input.description,
        internalNotes: input.internalNotes ?? null,
        messageText: input.messageText,
        mediaKey: input.mediaKey ?? null,
        mediaMime: input.mediaMime ?? null,
        mediaCaption: input.mediaCaption ?? null,
        ctaLabel: input.ctaLabel ?? null,
        ctaUrl: input.ctaUrl ?? null,
        targetListId: input.targetListId,
        deviceModePolicy: input.deviceModePolicy,
        allowedSpeeds: input.allowedSpeeds,
        payoutPerSend: toMoneyString(input.payoutPerSend),
        currency: input.currency,
        quotaPerUser: input.quotaPerUser,
        maxConcurrentJobs: input.maxConcurrentJobs,
        assignmentPolicy: input.assignmentPolicy,
        allowUserPause: input.allowUserPause,
        requireTermsAccept: input.requireTermsAccept,
        retryLimit: input.retryLimit,
        scheduledStartAt: input.scheduledStartAt,
        scheduledEndAt: input.scheduledEndAt,
        ...(bumpsContent
          ? { contentVersion: before.contentVersion + 1 }
          : {}),
      },
    });

    // Assignments are replaced wholesale so a removed operator loses access.
    await tx.campaignAssignment.deleteMany({
      where: {
        campaignId: before.id,
        ...(input.assignmentPolicy === "SELECTED_USERS"
          ? { userId: { notIn: input.assignedUserIds } }
          : {}),
      },
    });

    if (input.assignmentPolicy === "SELECTED_USERS") {
      await tx.campaignAssignment.createMany({
        data: input.assignedUserIds.map((userId) => ({
          campaignId: before.id,
          userId,
        })),
        skipDuplicates: true,
      });
    }

    await recordAudit(
      {
        actorUserId: params.adminUserId,
        actorRole: "ADMIN",
        action: "CAMPAIGN_UPDATE",
        resourceType: "CAMPAIGN",
        resourceId: before.id,
        beforeSummary: {
          contentVersion: before.contentVersion,
          targetListId: before.targetListId,
          payoutPerSend: before.payoutPerSend.toString(),
        },
        afterSummary: {
          contentVersion: bumpsContent
            ? before.contentVersion + 1
            : before.contentVersion,
          targetListId: input.targetListId,
          payoutPerSend: toMoneyString(input.payoutPerSend),
          assignmentPolicy: input.assignmentPolicy,
        },
        ip: params.ip,
      },
      tx,
    );
  });
}

/** Allowed source states for each admin transition. */
const TRANSITIONS: Record<
  CampaignTransitionInput["action"],
  { from: readonly string[]; to: string }
> = {
  SCHEDULE: { from: ["DRAFT"], to: "SCHEDULED" },
  ACTIVATE: { from: ["DRAFT", "SCHEDULED"], to: "ACTIVE" },
  PAUSE: { from: ["ACTIVE"], to: "PAUSED" },
  RESUME: { from: ["PAUSED"], to: "ACTIVE" },
  CANCEL: {
    from: ["DRAFT", "SCHEDULED", "ACTIVE", "PAUSED"],
    to: "CANCELLED",
  },
  ARCHIVE: {
    from: ["COMPLETED", "PARTIAL_FAILED", "CANCELLED", "EXPIRED"],
    to: "ARCHIVED",
  },
};

/**
 * Applies a lifecycle transition.
 *
 * The guarded `updateMany` makes the state change atomic: two admins racing the
 * same transition cannot both succeed.
 */
export async function transitionCampaign(params: {
  adminUserId: string;
  input: CampaignTransitionInput;
  ip?: string;
}): Promise<void> {
  const { input } = params;

  const campaign = await prisma.campaign.findUnique({
    where: { id: input.campaignId },
    select: {
      id: true,
      status: true,
      archivedAt: true,
      scheduledEndAt: true,
      targetList: { select: { status: true, importedCount: true } },
    },
  });

  if (!campaign) {
    throw notFound("This campaign no longer exists.");
  }

  const rule = TRANSITIONS[input.action];

  if (!rule.from.includes(campaign.status)) {
    throw invalidState(
      `A ${campaign.status.toLowerCase()} campaign cannot be ${input.action.toLowerCase()}d.`,
    );
  }

  if (input.action === "ACTIVATE" || input.action === "RESUME") {
    if (campaign.targetList.status !== "READY") {
      throw invalidState("The target list is not ready yet.");
    }
    if (campaign.targetList.importedCount === 0) {
      throw invalidState("The target list has no usable numbers.");
    }
    if (campaign.scheduledEndAt <= new Date()) {
      throw invalidState("The scheduled window has already ended.");
    }
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const updated = await tx.campaign.updateMany({
      where: { id: campaign.id, status: campaign.status },
      data: {
        status: rule.to as never,
        ...(input.action === "ACTIVATE" ? { activatedAt: now } : {}),
        ...(input.action === "ARCHIVE" ? { archivedAt: now } : {}),
      },
    });

    if (updated.count !== 1) {
      throw conflict("This campaign was changed by someone else.");
    }

    await recordAudit(
      {
        actorUserId: params.adminUserId,
        actorRole: "ADMIN",
        action: "CAMPAIGN_TRANSITION",
        resourceType: "CAMPAIGN",
        resourceId: campaign.id,
        beforeSummary: { status: campaign.status },
        afterSummary: { status: rule.to, action: input.action },
        reason: input.reason,
        ip: params.ip,
      },
      tx,
    );
  });
}

export type UserCampaignSummary = {
  id: string;
  name: string;
  description: string;
  payoutPerSend: string;
  currency: string;
  quotaPerUser: number;
  quotaUsed: number;
  quotaRemaining: number;
  allowedSpeeds: number[];
  allowUserPause: boolean;
  requireTermsAccept: boolean;
  deviceModePolicy: "SINGLE_DEVICE" | "ALL_DEVICES";
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  /** Numbers the admin loaded into this campaign's target list. */
  targetTotal: number;
  /** Numbers no operator has claimed yet. Aggregate only, never the numbers. */
  targetAvailable: number;
  /** True when the operator may start a job right now. */
  startable: boolean;
};

/**
 * Lists ACTIVE campaigns available to one operator.
 *
 * The projection deliberately excludes the target list, internal notes and every
 * recipient number: a USER must never see target data (RULES.md §6, §10).
 */
export async function listCampaignsForUser(
  userId: string,
): Promise<UserCampaignSummary[]> {
  const now = new Date();

  const campaigns = await prisma.campaign.findMany({
    where: {
      status: "ACTIVE",
      archivedAt: null,
      scheduledStartAt: { lte: now },
      scheduledEndAt: { gte: now },
      OR: [
        { assignmentPolicy: "ALL_ELIGIBLE" },
        {
          assignmentPolicy: "SELECTED_USERS",
          assignments: { some: { userId } },
        },
      ],
    },
    orderBy: { scheduledEndAt: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      targetListId: true,
      payoutPerSend: true,
      currency: true,
      quotaPerUser: true,
      allowedSpeeds: true,
      allowUserPause: true,
      requireTermsAccept: true,
      deviceModePolicy: true,
      scheduledStartAt: true,
      scheduledEndAt: true,
    },
  });

  if (campaigns.length === 0) {
    return [];
  }

  const campaignIds = campaigns.map((campaign) => campaign.id);

  // Quota consumption is counted from authoritative recipient rows, never a
  // cached counter on the job. The allocation figures are aggregates over the
  // same rows plus the target list size, so no number is ever projected.
  const [used, claimed, targetTotals] = await Promise.all([
    prisma.campaignRecipient.groupBy({
      by: ["campaignId"],
      where: {
        campaignId: { in: campaignIds },
        blastJob: { userId },
        status: { not: "CANCELLED" },
      },
      _count: { _all: true },
    }),
    prisma.campaignRecipient.groupBy({
      by: ["campaignId"],
      where: { campaignId: { in: campaignIds } },
      _count: { _all: true },
    }),
    prisma.targetNumber.groupBy({
      by: ["targetListId"],
      where: {
        targetListId: {
          in: [...new Set(campaigns.map((campaign) => campaign.targetListId))],
        },
      },
      _count: { _all: true },
    }),
  ]);

  const usedByCampaign = new Map(
    used.map((row) => [row.campaignId, row._count._all]),
  );
  const claimedByCampaign = new Map(
    claimed.map((row) => [row.campaignId, row._count._all]),
  );
  const totalByTargetList = new Map(
    targetTotals.map((row) => [row.targetListId, row._count._all]),
  );

  return campaigns.map((campaign) => {
    const quotaUsed = usedByCampaign.get(campaign.id) ?? 0;
    const quotaRemaining = Math.max(campaign.quotaPerUser - quotaUsed, 0);
    const targetTotal = totalByTargetList.get(campaign.targetListId) ?? 0;
    const targetAvailable = Math.max(
      targetTotal - (claimedByCampaign.get(campaign.id) ?? 0),
      0,
    );

    return {
      id: campaign.id,
      name: campaign.name,
      description: campaign.description,
      payoutPerSend: campaign.payoutPerSend.toString(),
      currency: campaign.currency,
      quotaPerUser: campaign.quotaPerUser,
      quotaUsed,
      quotaRemaining,
      allowedSpeeds: Array.isArray(campaign.allowedSpeeds)
        ? (campaign.allowedSpeeds as number[])
        : [],
      allowUserPause: campaign.allowUserPause,
      requireTermsAccept: campaign.requireTermsAccept,
      deviceModePolicy: campaign.deviceModePolicy,
      scheduledStartAt: campaign.scheduledStartAt,
      scheduledEndAt: campaign.scheduledEndAt,
      targetTotal,
      targetAvailable,
      startable: quotaRemaining > 0 && targetAvailable > 0,
    };
  });
}


