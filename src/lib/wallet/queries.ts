import "server-only";

import { prisma } from "@/lib/db/prisma";

/**
 * Read-only wallet, earnings and withdrawal queries for operator screens.
 *
 * Every projection here is masked: wallet ciphertext and full account numbers
 * never leave the service layer (RULES.md §15).
 */

export type EarningRow = {
  id: string;
  createdAt: Date;
  amount: string;
  currency: string;
  campaignName: string | null;
};

/** Recent earning credits for the caller. */
export async function listRecentEarnings(params: {
  userId: string;
  limit?: number;
}): Promise<EarningRow[]> {
  const rows = await prisma.ledgerEntry.findMany({
    where: { userId: params.userId, type: "EARNING", status: "SETTLED" },
    orderBy: { id: "desc" },
    take: Math.min(params.limit ?? 25, 100),
    select: {
      id: true,
      createdAt: true,
      amount: true,
      currency: true,
      blastJob: { select: { campaign: { select: { name: true } } } },
    },
  });

  return rows.map((row) => ({
    id: String(row.id),
    createdAt: row.createdAt,
    amount: row.amount.toString(),
    currency: row.currency,
    campaignName: row.blastJob?.campaign.name ?? null,
  }));
}

export type WithdrawalRow = {
  id: string;
  status:
    | "PENDING"
    | "PROCESSING"
    | "APPROVED"
    | "PAID"
    | "REJECTED"
    | "CANCELLED";
  amount: string;
  fee: string;
  netAmount: string;
  currency: string;
  providerName: string;
  accountMasked: string;
  rejectionReason: string | null;
  createdAt: Date;
  paidAt: Date | null;
  /** True while the operator may still cancel it themselves. */
  cancellable: boolean;
};

/** The caller's own withdrawal history. */
export async function listUserWithdrawals(params: {
  userId: string;
  limit?: number;
}): Promise<WithdrawalRow[]> {
  const rows = await prisma.withdrawal.findMany({
    where: { userId: params.userId },
    orderBy: { createdAt: "desc" },
    take: Math.min(params.limit ?? 25, 100),
    select: {
      id: true,
      status: true,
      amount: true,
      fee: true,
      netAmount: true,
      currency: true,
      walletProviderName: true,
      walletAccountLast4: true,
      rejectionReason: true,
      createdAt: true,
      paidAt: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    amount: row.amount.toString(),
    fee: row.fee.toString(),
    netAmount: row.netAmount.toString(),
    currency: row.currency,
    providerName: row.walletProviderName,
    accountMasked: `••••${row.walletAccountLast4}`,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt,
    paidAt: row.paidAt,
    cancellable: row.status === "PENDING",
  }));
}
