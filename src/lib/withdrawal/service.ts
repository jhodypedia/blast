import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { PrismaTransactionClient } from "@/lib/db/prisma";
import {
  conflict,
  forbidden,
  invalidState,
  notFound,
  validationError,
} from "@/lib/errors";
import {
  addMoney,
  isGreaterOrEqual,
  money,
  subtractMoney,
  toMoneyString,
} from "@/lib/money";
import { appendLedgerEntry, getBalance } from "@/lib/ledger/service";
import { getSetting } from "@/lib/settings/service";
import { SETTING_KEYS } from "@/lib/constants";
import { recordAudit } from "@/lib/audit/service";
import {
  NEXT_STATUS,
  REVIEWABLE_FROM,
  releasesFunds as releasesFundsFor,
  type ReviewAction,
} from "@/lib/withdrawal/transitions";
import { logger } from "@/lib/observability/logger";

/**
 * Withdrawal service (RULES.md §15).
 *
 * A request atomically creates a negative `WITHDRAWAL_HOLD` ledger entry, so the
 * same balance can never be withdrawn twice. Rejection or cancellation appends a
 * matching positive `WITHDRAWAL_RELEASE`; the hold is never deleted.
 */

const OPEN_STATUSES = ["PENDING", "PROCESSING", "APPROVED"] as const;

export type RequestWithdrawalResult = {
  withdrawalId: string;
  amount: string;
  fee: string;
  netAmount: string;
  currency: string;
};

export async function requestWithdrawal(params: {
  userId: string;
  requestedAmount: string;
}): Promise<RequestWithdrawalResult> {
  const [enabled, minAmount, feeSetting, currency] = await Promise.all([
    getSetting(SETTING_KEYS.withdrawalsEnabled),
    getSetting(SETTING_KEYS.minWithdrawalAmount),
    getSetting(SETTING_KEYS.withdrawalFee),
    getSetting(SETTING_KEYS.defaultCurrency),
  ]);

  if (!enabled) {
    throw invalidState("Withdrawals are temporarily unavailable.");
  }

  const amount = money(params.requestedAmount);
  if (!amount.greaterThan(0)) {
    throw validationError("Enter an amount greater than zero.", {
      amount: ["Enter a positive amount"],
    });
  }

  if (!isGreaterOrEqual(amount, minAmount)) {
    throw validationError("The amount is below the minimum withdrawal.", {
      amount: [`Minimum is ${toMoneyString(minAmount)}`],
    });
  }

  // Fee is always computed server-side; a client-supplied value is ignored.
  const fee = money(feeSetting);
  const netAmount = subtractMoney(amount, fee);
  if (!netAmount.greaterThan(0)) {
    throw validationError("The amount does not cover the withdrawal fee.", {
      amount: ["Increase the amount to cover the fee"],
    });
  }

  const wallet = await prisma.wallet.findUnique({
    where: { userId: params.userId },
    select: {
      status: true,
      providerCode: true,
      providerName: true,
      accountNumberLast4: true,
    },
  });

  if (!wallet) {
    throw invalidState("Set up your withdrawal wallet before requesting a payout.");
  }
  if (wallet.status !== "ACTIVE") {
    throw invalidState("Your wallet is under review. Withdrawals are paused.");
  }

  return prisma.$transaction(
    async (tx) => {
      // Re-check for an open request inside the transaction.
      const open = await tx.withdrawal.count({
        where: { userId: params.userId, status: { in: [...OPEN_STATUSES] } },
      });
      if (open > 0) {
        throw conflict(
          "You already have a withdrawal in progress. Wait for it to complete.",
        );
      }

      const balance = await getBalance(params.userId, currency, tx);
      if (!isGreaterOrEqual(balance.available, amount)) {
        throw validationError("Your available balance is not sufficient.", {
          amount: [`Available: ${balance.available}`],
        });
      }

      const withdrawal = await tx.withdrawal.create({
        data: {
          userId: params.userId,
          status: "PENDING",
          amount: toMoneyString(amount),
          fee: toMoneyString(fee),
          netAmount: toMoneyString(netAmount),
          currency,
          walletProviderCode: wallet.providerCode,
          walletProviderName: wallet.providerName,
          walletAccountLast4: wallet.accountNumberLast4,
          // Placeholder replaced below with the row id for stable uniqueness.
          holdIdempotencyKey: `hold:pending:${params.userId}:${Date.now()}`,
        },
        select: { id: true },
      });

      const holdKey = `hold:${withdrawal.id}`;

      await tx.withdrawal.update({
        where: { id: withdrawal.id },
        data: { holdIdempotencyKey: holdKey },
      });

      // Negative entry: reduces available balance immediately.
      const created = await appendLedgerEntry(
        {
          userId: params.userId,
          type: "WITHDRAWAL_HOLD",
          amount: amount.negated(),
          currency,
          sourceType: "WITHDRAWAL",
          sourceId: withdrawal.id,
          idempotencyKey: holdKey,
          reason: "Withdrawal requested",
        },
        tx,
      );

      if (!created) {
        throw conflict("This withdrawal has already been recorded.");
      }

      return {
        withdrawalId: withdrawal.id,
        amount: toMoneyString(amount),
        fee: toMoneyString(fee),
        netAmount: toMoneyString(netAmount),
        currency,
      };
    },
    { timeout: 15_000, isolationLevel: "Serializable" },
  );
}

/** Statuses an admin decision may legally move from. */
const REVIEWABLE: Record<string, readonly string[]> = REVIEWABLE_FROM;

export type { ReviewAction };

const AUDIT_ACTION = {
  APPROVE: "WITHDRAWAL_APPROVE",
  PROCESS: "WITHDRAWAL_PROCESS",
  MARK_PAID: "WITHDRAWAL_MARK_PAID",
  REJECT: "WITHDRAWAL_REJECT",
  CANCEL: "WITHDRAWAL_REJECT",
} as const;

/**
 * Applies an admin decision to a withdrawal.
 *
 * Rejection and cancellation append a compensating `WITHDRAWAL_RELEASE` entry
 * rather than removing the hold, keeping the ledger immutable. `MARK_PAID`
 * records a zero-value settlement marker: the hold already reduced the balance.
 */
export async function reviewWithdrawal(params: {
  adminUserId: string;
  withdrawalId: string;
  action: ReviewAction;
  note?: string;
  rejectionReason?: string;
  payoutReference?: string;
  /** Present when a USER cancels their own pending request. */
  actingUserId?: string;
}): Promise<void> {
  const withdrawal = await prisma.withdrawal.findUnique({
    where: { id: params.withdrawalId },
    select: {
      id: true,
      userId: true,
      status: true,
      amount: true,
      currency: true,
    },
  });

  if (!withdrawal) {
    throw notFound("This withdrawal request no longer exists.");
  }

  // A USER may only cancel, and only their own pending request.
  if (params.actingUserId && withdrawal.userId !== params.actingUserId) {
    throw forbidden("You can only manage your own withdrawal requests.");
  }

  const allowed = REVIEWABLE[params.action] ?? [];
  if (!allowed.includes(withdrawal.status)) {
    throw invalidState(
      `A ${withdrawal.status.toLowerCase()} withdrawal cannot be changed this way.`,
    );
  }

  const nextStatus = NEXT_STATUS[params.action];
  const releasesFunds = releasesFundsFor(params.action);

  await prisma.$transaction(
    async (tx) => {
      const now = new Date();

      const updated = await tx.withdrawal.updateMany({
        where: { id: withdrawal.id, status: withdrawal.status },
        data: {
          status: nextStatus,
          reviewedByAdminId: params.actingUserId ? null : params.adminUserId,
          adminNote: params.note?.slice(0, 255) ?? null,
          rejectionReason: params.rejectionReason?.slice(0, 255) ?? null,
          ...(params.action === "PROCESS" ? { processedAt: now } : {}),
          ...(params.action === "MARK_PAID"
            ? {
                paidAt: now,
                payoutReference: params.payoutReference?.slice(0, 191) ?? null,
              }
            : {}),
          ...(releasesFunds
            ? { releaseIdempotencyKey: `release:${withdrawal.id}` }
            : {}),
        },
      });

      if (updated.count !== 1) {
        // Another admin acted first; the state machine already moved on.
        throw conflict("This withdrawal was updated by someone else.");
      }

      if (releasesFunds) {
        // Positive compensating entry restores the held balance exactly once.
        await appendLedgerEntry(
          {
            userId: withdrawal.userId,
            type: "WITHDRAWAL_RELEASE",
            amount: money(withdrawal.amount.toString()),
            currency: withdrawal.currency,
            sourceType: "WITHDRAWAL",
            sourceId: withdrawal.id,
            idempotencyKey: `release:${withdrawal.id}`,
            reason:
              params.rejectionReason ??
              (params.action === "CANCEL"
                ? "Withdrawal cancelled"
                : "Withdrawal rejected"),
            actorUserId: params.actingUserId ?? params.adminUserId,
          },
          tx,
        );
      }

      if (params.action === "MARK_PAID") {
        await appendLedgerEntry(
          {
            userId: withdrawal.userId,
            type: "WITHDRAWAL_SETTLEMENT",
            amount: "0",
            currency: withdrawal.currency,
            sourceType: "WITHDRAWAL",
            sourceId: withdrawal.id,
            idempotencyKey: `settle:${withdrawal.id}`,
            reason: "Withdrawal paid",
            actorUserId: params.adminUserId,
            metadata: { payoutReference: params.payoutReference ?? null },
          },
          tx,
        );
      }

      await recordAudit(
        {
          actorUserId: params.actingUserId ?? params.adminUserId,
          actorRole: params.actingUserId ? "USER" : "ADMIN",
          action: AUDIT_ACTION[params.action],
          resourceType: "WITHDRAWAL",
          resourceId: withdrawal.id,
          beforeSummary: { status: withdrawal.status },
          afterSummary: { status: nextStatus },
          reason: params.rejectionReason ?? params.note,
        },
        tx,
      );
    },
    { timeout: 15_000 },
  );

  logger("withdrawal").info(
    {
      event: "withdrawal.reviewed",
      withdrawalId: withdrawal.id,
      action: params.action,
    },
    "Withdrawal decision recorded",
  );
}

/** ADMIN manual balance adjustment. Always audited and always reasoned. */
export async function adjustBalance(params: {
  adminUserId: string;
  userId: string;
  direction: "CREDIT" | "DEBIT";
  amount: string;
  reason: string;
  currency?: string;
  tx?: PrismaTransactionClient;
}): Promise<void> {
  const currency =
    params.currency ?? (await getSetting(SETTING_KEYS.defaultCurrency));
  const magnitude = money(params.amount);

  if (!magnitude.greaterThan(0)) {
    throw validationError("Enter an amount greater than zero.", {
      amount: ["Enter a positive amount"],
    });
  }

  const signed =
    params.direction === "CREDIT" ? magnitude : magnitude.negated();
  const stamp = Date.now();

  const run = async (tx: PrismaTransactionClient): Promise<void> => {
    if (params.direction === "DEBIT") {
      const balance = await getBalance(params.userId, currency, tx);
      if (!isGreaterOrEqual(balance.available, magnitude)) {
        throw validationError(
          "The adjustment would take the balance below zero.",
          { amount: [`Available: ${balance.available}`] },
        );
      }
    }

    await appendLedgerEntry(
      {
        userId: params.userId,
        type:
          params.direction === "CREDIT"
            ? "ADJUSTMENT_CREDIT"
            : "ADJUSTMENT_DEBIT",
        amount: signed,
        currency,
        sourceType: "ADMIN_ADJUSTMENT",
        sourceId: `${params.adminUserId}:${stamp}`,
        idempotencyKey: `adjust:${params.adminUserId}:${params.userId}:${stamp}`,
        reason: params.reason,
        actorUserId: params.adminUserId,
      },
      tx,
    );

    await recordAudit(
      {
        actorUserId: params.adminUserId,
        actorRole: "ADMIN",
        action: "LEDGER_ADJUSTMENT",
        resourceType: "LEDGER_ENTRY",
        resourceId: params.userId,
        afterSummary: {
          direction: params.direction,
          amount: toMoneyString(magnitude),
          currency,
        },
        reason: params.reason,
      },
      tx,
    );
  };

  if (params.tx) {
    await run(params.tx);
    return;
  }

  await prisma.$transaction(run, { timeout: 15_000 });
}

/** Sums the amounts of a user's open withdrawal requests. */
export async function openWithdrawalTotal(userId: string): Promise<string> {
  const rows = await prisma.withdrawal.findMany({
    where: { userId, status: { in: [...OPEN_STATUSES] } },
    select: { amount: true },
  });

  return toMoneyString(addMoney(...rows.map((row) => row.amount.toString())));
}
