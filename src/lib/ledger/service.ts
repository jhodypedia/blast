import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { PrismaTransactionClient } from "@/lib/db/prisma";
import {
  addMoney,
  isGreaterOrEqual,
  money,
  toMoneyString,
  type MoneyInput,
} from "@/lib/money";
import { DEFAULT_CURRENCY } from "@/lib/constants";

/**
 * Ledger service (RULES.md §14).
 *
 * The ledger is append-only. Balances are always derived by summing entries —
 * there is no mutable balance column that could drift or be double-spent.
 * Every write carries a unique idempotency key.
 */

export type Balance = {
  /** Sum of every settled entry. */
  total: string;
  /** Amount currently held for pending withdrawals (positive number). */
  held: string;
  /** Withdrawable amount: total minus holds. */
  available: string;
  currency: string;
};

/**
 * Computes a user's balance from ledger entries.
 *
 * `WITHDRAWAL_HOLD` entries are negative amounts that already reduce the total,
 * so `available` equals the plain sum of settled entries; `held` is reported
 * separately for UI transparency.
 */
export async function getBalance(
  userId: string,
  currency: string = DEFAULT_CURRENCY,
  tx?: PrismaTransactionClient,
): Promise<Balance> {
  const client = tx ?? prisma;

  const [totals, holds] = await Promise.all([
    client.ledgerEntry.aggregate({
      where: { userId, currency, status: "SETTLED" },
      _sum: { amount: true },
    }),
    client.ledgerEntry.aggregate({
      where: {
        userId,
        currency,
        status: "SETTLED",
        type: "WITHDRAWAL_HOLD",
      },
      _sum: { amount: true },
    }),
  ]);

  const total = money(totals._sum.amount?.toString() ?? "0");
  // Holds are stored as negatives; report the magnitude.
  const held = money(holds._sum.amount?.toString() ?? "0").negated();

  return {
    total: toMoneyString(total),
    held: toMoneyString(held),
    available: toMoneyString(total),
    currency,
  };
}

/** True when the user can cover `amount` from available balance. */
export async function hasAvailableBalance(
  userId: string,
  amount: MoneyInput,
  currency: string = DEFAULT_CURRENCY,
  tx?: PrismaTransactionClient,
): Promise<boolean> {
  const balance = await getBalance(userId, currency, tx);
  return isGreaterOrEqual(balance.available, amount);
}

export type LedgerWriteInput = {
  userId: string;
  type:
    | "EARNING"
    | "WITHDRAWAL_HOLD"
    | "WITHDRAWAL_RELEASE"
    | "WITHDRAWAL_SETTLEMENT"
    | "ADJUSTMENT_CREDIT"
    | "ADJUSTMENT_DEBIT"
    | "WITHDRAWAL_FEE";
  /** Signed amount: positive credits, negative debits. */
  amount: MoneyInput;
  currency: string;
  sourceType: string;
  sourceId: string;
  blastJobId?: string;
  idempotencyKey: string;
  reason?: string;
  actorUserId?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Appends a ledger entry. Duplicate idempotency keys are ignored rather than
 * throwing, so a retried operation is a no-op.
 *
 * Returns true when a new row was created.
 */
export async function appendLedgerEntry(
  input: LedgerWriteInput,
  tx?: PrismaTransactionClient,
): Promise<boolean> {
  const client = tx ?? prisma;

  const result = await client.ledgerEntry.createMany({
    data: [
      {
        userId: input.userId,
        type: input.type,
        status: "SETTLED",
        amount: toMoneyString(input.amount),
        currency: input.currency,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        blastJobId: input.blastJobId ?? null,
        idempotencyKey: input.idempotencyKey,
        reason: input.reason ?? null,
        actorUserId: input.actorUserId ?? null,
        metadata: (input.metadata ?? null) as never,
      },
    ],
    skipDuplicates: true,
  });

  return result.count === 1;
}

/** Total earnings credited for one blast job. */
export async function blastJobEarnings(
  blastJobId: string,
  tx?: PrismaTransactionClient,
): Promise<string> {
  const client = tx ?? prisma;

  const result = await client.ledgerEntry.aggregate({
    where: { blastJobId, type: "EARNING", status: "SETTLED" },
    _sum: { amount: true },
  });

  return toMoneyString(result._sum.amount?.toString() ?? "0");
}

/** Sums a list of monetary strings safely. */
export function sumAmounts(values: readonly MoneyInput[]): string {
  return toMoneyString(addMoney(...values));
}
