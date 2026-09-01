import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { PrismaTransactionClient } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/logger";
import { toMoneyString } from "@/lib/money";

/**
 * Delivery result recording (RULES.md §12, §14).
 *
 * Every transition below is conditional on the recipient still being in the
 * expected state and still owned by the calling worker. When the condition
 * fails the row is *not* modified and a reconciliation event is raised instead,
 * so an ambiguous send is never repeated.
 */

export type RecordSentParams = {
  recipientId: bigint;
  blastJobId: string;
  userId: string;
  workerId: string;
  providerMessageId?: string;
  /** Payout snapshotted on the blast job at creation time. */
  payoutPerSend: string;
  currency: string;
  /** Deterministic key shared by the recipient row and the ledger entry. */
  idempotencyKey: string;
};

/**
 * Transitions a recipient to `SENT` and credits earnings in one transaction.
 *
 * Idempotency is enforced twice: the recipient update is conditional on the row
 * still being `SENDING` for this worker, and the ledger insert uses a unique
 * idempotency key. A retry can therefore never double-credit.
 */
export async function recordSent(params: RecordSentParams): Promise<
  | { outcome: "RECORDED" }
  | { outcome: "ALREADY_RECORDED" }
  | { outcome: "RECONCILIATION_REQUIRED" }
> {
  const now = new Date();

  return prisma.$transaction(
    async (tx) => {
      const updated = await tx.campaignRecipient.updateMany({
        where: {
          id: params.recipientId,
          workerId: params.workerId,
          status: "SENDING",
        },
        data: {
          status: "SENT",
          sentAt: now,
          providerMessageId: params.providerMessageId ?? null,
          failureCategory: null,
          failureReason: null,
          leaseExpiresAt: null,
        },
      });

      if (updated.count !== 1) {
        // The row moved on (lease lost, admin cancel, crash recovery). The send
        // already happened, so never resend — hand it to reconciliation.
        const current = await tx.campaignRecipient.findUnique({
          where: { id: params.recipientId },
          select: { status: true },
        });

        if (current?.status === "SENT") {
          return { outcome: "ALREADY_RECORDED" as const };
        }

        await tx.campaignRecipient.updateMany({
          where: { id: params.recipientId, status: { not: "SENT" } },
          data: {
            status: "RECONCILIATION_REQUIRED",
            failureCategory: "RESULT_WRITE_CONFLICT",
            failureReason: "Send completed but the result could not be stored",
            leaseExpiresAt: null,
          },
        });

        await tx.reconciliationEvent.create({
          data: {
            blastJobId: params.blastJobId,
            recipientId: params.recipientId,
            reason: "RESULT_WRITE_CONFLICT",
            detail:
              "Provider accepted the message but the recipient row was no longer owned by this worker.",
          },
        });

        return { outcome: "RECONCILIATION_REQUIRED" as const };
      }

      // Immutable, idempotent earnings credit.
      await tx.ledgerEntry.createMany({
        data: [
          {
            userId: params.userId,
            type: "EARNING",
            status: "SETTLED",
            amount: toMoneyString(params.payoutPerSend),
            currency: params.currency,
            sourceType: "CAMPAIGN_RECIPIENT",
            sourceId: params.recipientId.toString(),
            blastJobId: params.blastJobId,
            idempotencyKey: params.idempotencyKey,
          },
        ],
        skipDuplicates: true,
      });

      return { outcome: "RECORDED" as const };
    },
    { timeout: 10_000 },
  );
}

export type RecordFailureParams = {
  recipientId: bigint;
  workerId: string;
  category: string;
  reason: string;
  /** True when the failure class is safe to retry. */
  retryable: boolean;
  /** Snapshotted retry limit from the blast job. */
  retryLimit: number;
  /** Backoff before the next attempt, in milliseconds. */
  backoffMs: number;
};

/**
 * Records a definite send failure. Retryable failures below the limit are
 * scheduled for another attempt; everything else becomes terminal `FAILED`,
 * which only an audited ADMIN retry can revive.
 */
export async function recordFailure(
  params: RecordFailureParams,
): Promise<"RETRY_SCHEDULED" | "FAILED" | "LEASE_LOST"> {
  const recipient = await prisma.campaignRecipient.findUnique({
    where: { id: params.recipientId },
    select: { attemptCount: true, workerId: true, status: true },
  });

  if (
    !recipient ||
    recipient.workerId !== params.workerId ||
    recipient.status !== "SENDING"
  ) {
    return "LEASE_LOST";
  }

  const canRetry =
    params.retryable && recipient.attemptCount <= params.retryLimit;

  const result = await prisma.campaignRecipient.updateMany({
    where: {
      id: params.recipientId,
      workerId: params.workerId,
      status: "SENDING",
    },
    data: canRetry
      ? {
          status: "RETRYABLE_FAILED",
          failureCategory: params.category.slice(0, 64),
          failureReason: params.reason.slice(0, 255),
          nextAttemptAt: new Date(Date.now() + params.backoffMs),
          workerId: null,
          lockedAt: null,
          leaseExpiresAt: null,
        }
      : {
          status: "FAILED",
          failureCategory: params.category.slice(0, 64),
          failureReason: params.reason.slice(0, 255),
          nextAttemptAt: null,
          leaseExpiresAt: null,
        },
  });

  if (result.count !== 1) {
    return "LEASE_LOST";
  }

  return canRetry ? "RETRY_SCHEDULED" : "FAILED";
}

/**
 * Records an ambiguous outcome. Never retried automatically (RULES.md §12);
 * an ADMIN must resolve it through the reconciliation flow.
 */
export async function recordAmbiguous(params: {
  recipientId: bigint;
  blastJobId: string;
  workerId: string;
  reason: string;
  detail?: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.campaignRecipient.updateMany({
      where: {
        id: params.recipientId,
        workerId: params.workerId,
        status: { in: ["SENDING", "CLAIMED"] },
      },
      data: {
        status: "UNKNOWN",
        failureCategory: params.reason.slice(0, 64),
        failureReason:
          "Delivery outcome could not be confirmed; awaiting reconciliation",
        nextAttemptAt: null,
        leaseExpiresAt: null,
      },
    });

    await tx.reconciliationEvent.create({
      data: {
        blastJobId: params.blastJobId,
        recipientId: params.recipientId,
        reason: params.reason.slice(0, 64),
        detail: params.detail ?? null,
      },
    });
  });

  logger("delivery").warn(
    { event: "delivery.ambiguous", blastJobId: params.blastJobId },
    "Ambiguous delivery recorded for reconciliation",
  );
}

/** Cancels all outstanding recipients for a stopped job. */
export async function cancelOutstanding(params: {
  blastJobId: string;
  tx?: PrismaTransactionClient;
}): Promise<number> {
  const client = params.tx ?? prisma;

  const result = await client.campaignRecipient.updateMany({
    where: {
      blastJobId: params.blastJobId,
      status: { in: ["PENDING", "CLAIMED", "RETRYABLE_FAILED"] },
    },
    data: {
      status: "CANCELLED",
      workerId: null,
      lockedAt: null,
      leaseExpiresAt: null,
      nextAttemptAt: null,
    },
  });

  return result.count;
}
