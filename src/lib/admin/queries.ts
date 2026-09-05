import "server-only";

import { prisma } from "@/lib/db/prisma";

/**
 * Admin read-only queries.
 *
 * These power the admin screens only; every projection is ADMIN-scoped and the
 * campaign rows include operational counts that a USER must never see.
 */

export type AdminCampaignRow = {
  id: string;
  name: string;
  status: string;
  targetListId: string;
  targetListName: string;
  targetCount: number;
  payoutPerSend: string;
  currency: string;
  quotaPerUser: number;
  recipientCount: number;
  sentCount: number;
  jobCount: number;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  createdAt: Date;
  /** Full Baileys configuration, used to prefill the admin edit form. */
  config: {
    description: string;
    internalNotes: string;
    messageType: "TEXT" | "IMAGE" | "BUTTON";
    messageText: string;
    mediaKey: string;
    mediaMime: string;
    mediaCaption: string;
    ctaLabel: string;
    ctaUrl: string;
    deviceModePolicy: "SINGLE_DEVICE" | "ALL_DEVICES";
    allowedSpeeds: number[];
    maxConcurrentJobs: number;
    assignmentPolicy: "ALL_ELIGIBLE" | "SELECTED_USERS";
    assignedUserIds: string[];
    allowUserPause: boolean;
    requireTermsAccept: boolean;
    retryLimit: number;
  };
};

export async function listCampaignsForAdmin(params?: {
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ campaigns: AdminCampaignRow[]; total: number }> {
  const page = params?.page ?? 1;
  const pageSize = Math.min(params?.pageSize ?? 20, 100);

  const where = {
    ...(params?.status ? { status: params.status as never } : {}),
    ...(params?.search ? { name: { contains: params.search } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.campaign.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        status: true,
        description: true,
        internalNotes: true,
        messageType: true,
        messageText: true,
        mediaKey: true,
        mediaMime: true,
        mediaCaption: true,
        ctaLabel: true,
        ctaUrl: true,
        targetListId: true,
        deviceModePolicy: true,
        allowedSpeeds: true,
        payoutPerSend: true,
        currency: true,
        quotaPerUser: true,
        maxConcurrentJobs: true,
        assignmentPolicy: true,
        allowUserPause: true,
        requireTermsAccept: true,
        retryLimit: true,
        scheduledStartAt: true,
        scheduledEndAt: true,
        createdAt: true,
        targetList: { select: { name: true, importedCount: true } },
        assignments: { select: { userId: true } },
        _count: { select: { recipients: true, blastJobs: true } },
      },
    }),
    prisma.campaign.count({ where }),
  ]);

  const sent = await prisma.campaignRecipient.groupBy({
    by: ["campaignId"],
    where: {
      campaignId: { in: rows.map((row) => row.id) },
      status: "SENT",
    },
    _count: { _all: true },
  });

  const sentByCampaign = new Map(
    sent.map((row) => [row.campaignId, row._count._all]),
  );

  return {
    total,
    campaigns: rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      targetListId: row.targetListId,
      targetListName: row.targetList.name,
      targetCount: row.targetList.importedCount,
      payoutPerSend: row.payoutPerSend.toString(),
      currency: row.currency,
      quotaPerUser: row.quotaPerUser,
      recipientCount: row._count.recipients,
      sentCount: sentByCampaign.get(row.id) ?? 0,
      jobCount: row._count.blastJobs,
      scheduledStartAt: row.scheduledStartAt,
      scheduledEndAt: row.scheduledEndAt,
      createdAt: row.createdAt,
      config: {
        description: row.description,
        internalNotes: row.internalNotes ?? "",
        messageType: row.messageType,
        messageText: row.messageText,
        mediaKey: row.mediaKey ?? "",
        mediaMime: row.mediaMime ?? "",
        mediaCaption: row.mediaCaption ?? "",
        ctaLabel: row.ctaLabel ?? "",
        ctaUrl: row.ctaUrl ?? "",
        deviceModePolicy: row.deviceModePolicy,
        allowedSpeeds: Array.isArray(row.allowedSpeeds)
          ? (row.allowedSpeeds as number[])
          : [],
        maxConcurrentJobs: row.maxConcurrentJobs,
        assignmentPolicy: row.assignmentPolicy,
        assignedUserIds: row.assignments.map((assignment) => assignment.userId),
        allowUserPause: row.allowUserPause,
        requireTermsAccept: row.requireTermsAccept,
        retryLimit: row.retryLimit,
      },
    })),
  };
}

export type AdminWithdrawalRow = {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  status: string;
  amount: string;
  fee: string;
  netAmount: string;
  currency: string;
  providerName: string;
  accountMasked: string;
  createdAt: Date;
};

/** Withdrawal queue for admin review. Account numbers stay masked. */
export async function listWithdrawalsForAdmin(params?: {
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ withdrawals: AdminWithdrawalRow[]; total: number }> {
  const page = params?.page ?? 1;
  const pageSize = Math.min(params?.pageSize ?? 20, 100);
  const where = params?.status ? { status: params.status as never } : {};

  const [rows, total] = await Promise.all([
    prisma.withdrawal.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        userId: true,
        status: true,
        amount: true,
        fee: true,
        netAmount: true,
        currency: true,
        walletProviderName: true,
        walletAccountLast4: true,
        createdAt: true,
        user: { select: { email: true, name: true } },
      },
    }),
    prisma.withdrawal.count({ where }),
  ]);

  return {
    total,
    withdrawals: rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      userEmail: row.user.email,
      userName: row.user.name,
      status: row.status,
      amount: row.amount.toString(),
      fee: row.fee.toString(),
      netAmount: row.netAmount.toString(),
      currency: row.currency,
      providerName: row.walletProviderName,
      accountMasked: `••••${row.walletAccountLast4}`,
      createdAt: row.createdAt,
    })),
  };
}

export type AdminWalletRequestRow = {
  id: string;
  userId: string;
  userEmail: string;
  providerName: string;
  accountMasked: string;
  createdAt: Date;
};

/** Pending wallet change requests. Only masked details are exposed. */
export async function listWalletChangeRequests(): Promise<
  AdminWalletRequestRow[]
> {
  const rows = await prisma.walletChangeRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: {
      id: true,
      userId: true,
      providerName: true,
      accountNumberLast4: true,
      createdAt: true,
      user: { select: { email: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    userEmail: row.user.email,
    providerName: row.providerName,
    accountMasked: `••••${row.accountNumberLast4}`,
    createdAt: row.createdAt,
  }));
}

export type AdminAuditRow = {
  id: string;
  actorEmail: string | null;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  reason: string | null;
  createdAt: Date;
};

/** Immutable audit trail, newest first. */
export async function listAuditLog(params?: {
  action?: string;
  resourceType?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ entries: AdminAuditRow[]; total: number }> {
  const page = params?.page ?? 1;
  const pageSize = Math.min(params?.pageSize ?? 20, 100);

  const where = {
    ...(params?.action ? { action: params.action } : {}),
    ...(params?.resourceType ? { resourceType: params.resourceType } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        actorRole: true,
        action: true,
        resourceType: true,
        resourceId: true,
        reason: true,
        createdAt: true,
        actor: { select: { email: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    total,
    entries: rows.map((row) => ({
      id: String(row.id),
      actorEmail: row.actor?.email ?? null,
      actorRole: row.actorRole,
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      reason: row.reason,
      createdAt: row.createdAt,
    })),
  };
}
