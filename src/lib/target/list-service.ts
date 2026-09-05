import "server-only";

import { prisma } from "@/lib/db/prisma";
import { invalidState, notFound } from "@/lib/errors";
import { recordAudit } from "@/lib/audit/service";
import { getSetting } from "@/lib/settings/service";
import { SETTING_KEYS } from "@/lib/constants";
import { saveTargetUpload, sanitizeFileName } from "@/lib/storage/private-storage";
import { enqueueTargetImport } from "@/lib/queue/queues";
import { logger } from "@/lib/observability/logger";

/**
 * Target-list service — ADMIN only (RULES.md §10).
 *
 * The uploaded file is streamed to private storage and then handed to the import
 * worker through BullMQ. Nothing here parses the file inline, so a large upload
 * never occupies a request lifecycle, and no code path exposes raw numbers.
 */

export type TargetListSummary = {
  id: string;
  name: string;
  status:
    | "UPLOADING"
    | "VALIDATING"
    | "PARSING"
    | "IMPORTING"
    | "READY"
    | "FAILED"
    | "ARCHIVED";
  originalFileName: string;
  sourceRowCount: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  importedCount: number;
  errorSummary: string | null;
  createdAt: Date;
  importFinishedAt: Date | null;
  /** Campaigns currently referencing this list. Blocks archiving while > 0. */
  campaignCount: number;
};

export async function listTargetLists(params?: {
  includeArchived?: boolean;
}): Promise<TargetListSummary[]> {
  const lists = await prisma.targetList.findMany({
    where: params?.includeArchived ? {} : { archivedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      originalFileName: true,
      sourceRowCount: true,
      validCount: true,
      invalidCount: true,
      duplicateCount: true,
      importedCount: true,
      errorSummary: true,
      createdAt: true,
      importFinishedAt: true,
      _count: { select: { campaigns: true } },
    },
  });

  return lists.map((list) => ({
    id: list.id,
    name: list.name,
    status: list.status,
    originalFileName: list.originalFileName,
    sourceRowCount: list.sourceRowCount,
    validCount: list.validCount,
    invalidCount: list.invalidCount,
    duplicateCount: list.duplicateCount,
    importedCount: list.importedCount,
    errorSummary: list.errorSummary,
    createdAt: list.createdAt,
    importFinishedAt: list.importFinishedAt,
    campaignCount: list._count.campaigns,
  }));
}

/**
 * Persists an uploaded file and queues the import.
 *
 * The row is created first so a crash between write and enqueue leaves a visible
 * record rather than an orphaned file.
 */
export async function createTargetListFromUpload(params: {
  adminUserId: string;
  name: string;
  file: File;
  defaultCountryCode?: string;
  ip?: string;
}): Promise<{ targetListId: string }> {
  const [maxBytes, settingCountry] = await Promise.all([
    getSetting(SETTING_KEYS.maxTargetFileBytes),
    getSetting(SETTING_KEYS.defaultCountryCode),
  ]);

  const defaultCountryCode = params.defaultCountryCode ?? settingCountry;

  const stored = await saveTargetUpload({ file: params.file, maxBytes });

  const list = await prisma.$transaction(async (tx) => {
    const created = await tx.targetList.create({
      data: {
        name: params.name,
        status: "VALIDATING",
        uploadedByAdminId: params.adminUserId,
        originalFileName: sanitizeFileName(params.file.name),
        storageKey: stored.storageKey,
        byteSize: stored.byteSize,
        defaultCountryCode,
      },
      select: { id: true },
    });

    await recordAudit(
      {
        actorUserId: params.adminUserId,
        actorRole: "ADMIN",
        action: "TARGET_LIST_UPLOAD",
        resourceType: "TARGET_LIST",
        resourceId: created.id,
        afterSummary: {
          name: params.name,
          byteSize: stored.byteSize,
          defaultCountryCode,
        },
        ip: params.ip,
      },
      tx,
    );

    return created;
  });

  await enqueueTargetImport({
    targetListId: list.id,
    storageKey: stored.storageKey,
    defaultCountryCode,
  });

  logger("target").info(
    {
      event: "target.import_queued",
      targetListId: list.id,
      byteSize: stored.byteSize,
    },
    "Target list import queued",
  );

  return { targetListId: list.id };
}

/**
 * Archives a target list.
 *
 * Numbers are retained: campaign delivery history must stay reconstructable
 * (RULES.md §20), so this is a soft delete and never a row removal.
 */
export async function archiveTargetList(params: {
  adminUserId: string;
  targetListId: string;
  reason?: string;
  ip?: string;
}): Promise<void> {
  const list = await prisma.targetList.findUnique({
    where: { id: params.targetListId },
    select: { id: true, name: true, archivedAt: true, status: true },
  });

  if (!list) {
    throw notFound("This target list no longer exists.");
  }
  if (list.archivedAt) {
    throw invalidState("This target list is already archived.");
  }

  // A list still referenced by a live campaign must not disappear from view.
  const activeCampaigns = await prisma.campaign.count({
    where: {
      targetListId: list.id,
      status: { in: ["DRAFT", "SCHEDULED", "ACTIVE", "PAUSED"] },
      archivedAt: null,
    },
  });

  if (activeCampaigns > 0) {
    throw invalidState(
      "This list is used by a live campaign. Cancel or complete the campaign first.",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.targetList.update({
      where: { id: list.id },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });

    await recordAudit(
      {
        actorUserId: params.adminUserId,
        actorRole: "ADMIN",
        action: "TARGET_LIST_ARCHIVE",
        resourceType: "TARGET_LIST",
        resourceId: list.id,
        beforeSummary: { status: list.status },
        afterSummary: { status: "ARCHIVED" },
        reason: params.reason,
        ip: params.ip,
      },
      tx,
    );
  });
}

/**
 * Aggregate target-number statistics for the Target Nomor overview.
 *
 * Counts only: uploaded numbers, numbers already allocated into an operator's
 * recipient rows, and the delivery outcome of those rows. No number is ever
 * projected, so this is safe for any admin surface (RULES.md §10).
 */
export type TargetAllocationStats = {
  uploaded: number;
  allocated: number;
  remaining: number;
  sent: number;
  error: number;
  pending: number;
};

export async function getTargetAllocationStats(): Promise<TargetAllocationStats> {
  const [uploaded, allocated, byStatus] = await Promise.all([
    // Numbers live under a list; archived lists stay counted because their
    // recipients and delivery history remain valid.
    prisma.targetNumber.count(),
    prisma.campaignRecipient.count(),
    prisma.campaignRecipient.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  let sent = 0;
  let error = 0;
  let pending = 0;

  for (const row of byStatus) {
    const amount = row._count._all;

    switch (row.status) {
      case "SENT":
        sent += amount;
        break;
      case "FAILED":
      case "UNKNOWN":
      case "RECONCILIATION_REQUIRED":
        error += amount;
        break;
      case "PENDING":
      case "CLAIMED":
      case "SENDING":
      case "RETRYABLE_FAILED":
        pending += amount;
        break;
      default:
        // CANCELLED and SKIPPED are resolved without a delivery outcome.
        break;
    }
  }

  return {
    uploaded,
    allocated,
    remaining: Math.max(uploaded - allocated, 0),
    sent,
    error,
    pending,
  };
}

/**
 * Returns the masked invalid-row report for one list.
 *
 * Samples are masked at parse time, so nothing here can leak a full number.
 */
export async function listInvalidRows(params: {
  targetListId: string;
  limit?: number;
}): Promise<Array<{ rowNumber: number; reason: string; sample: string }>> {
  return prisma.targetInvalidRow.findMany({
    where: { targetListId: params.targetListId },
    orderBy: { id: "asc" },
    take: Math.min(params.limit ?? 200, 1_000),
    select: { rowNumber: true, reason: true, sample: true },
  });
}

