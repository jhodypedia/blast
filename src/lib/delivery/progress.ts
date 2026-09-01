import "server-only";

import { prisma } from "@/lib/db/prisma";

/**
 * Blast-job progress aggregation.
 *
 * Counts always come from authoritative recipient rows, never from client-side
 * counters (RULES.md §11).
 */

export type ProgressCounts = {
  total: number;
  pending: number;
  inFlight: number;
  sent: number;
  failed: number;
  cancelled: number;
  skipped: number;
  needsReconciliation: number;
};

const EMPTY_COUNTS: ProgressCounts = {
  total: 0,
  pending: 0,
  inFlight: 0,
  sent: 0,
  failed: 0,
  cancelled: 0,
  skipped: 0,
  needsReconciliation: 0,
};

/** Aggregates recipient states for one blast job. */
export async function blastJobProgress(
  blastJobId: string,
): Promise<ProgressCounts> {
  const grouped = await prisma.campaignRecipient.groupBy({
    by: ["status"],
    where: { blastJobId },
    _count: { _all: true },
  });

  const counts: ProgressCounts = { ...EMPTY_COUNTS };

  for (const row of grouped) {
    const amount = row._count._all;
    counts.total += amount;

    switch (row.status) {
      case "PENDING":
      case "RETRYABLE_FAILED":
        counts.pending += amount;
        break;
      case "CLAIMED":
      case "SENDING":
        counts.inFlight += amount;
        break;
      case "SENT":
        counts.sent += amount;
        break;
      case "FAILED":
        counts.failed += amount;
        break;
      case "CANCELLED":
        counts.cancelled += amount;
        break;
      case "SKIPPED":
        counts.skipped += amount;
        break;
      case "UNKNOWN":
      case "RECONCILIATION_REQUIRED":
        counts.needsReconciliation += amount;
        break;
    }
  }

  return counts;
}

/** Percentage of resolved recipients, rounded to a whole number. */
export function completionPercent(counts: ProgressCounts): number {
  if (counts.total === 0) {
    return 0;
  }
  const resolved =
    counts.sent +
    counts.failed +
    counts.cancelled +
    counts.skipped +
    counts.needsReconciliation;
  return Math.min(100, Math.round((resolved / counts.total) * 100));
}

/**
 * Derives the terminal job status from authoritative counts.
 * Returns `null` while work remains outstanding.
 */
export function deriveTerminalStatus(
  counts: ProgressCounts,
): "COMPLETED" | "PARTIAL_FAILED" | null {
  if (counts.total === 0) {
    return "COMPLETED";
  }
  if (counts.pending > 0 || counts.inFlight > 0) {
    return null;
  }
  if (counts.failed > 0 || counts.needsReconciliation > 0) {
    return "PARTIAL_FAILED";
  }
  return "COMPLETED";
}
