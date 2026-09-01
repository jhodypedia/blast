import "server-only";

import { prisma } from "@/lib/db/prisma";
import { conflict, invalidState, notFound } from "@/lib/errors";
import { encryptToString } from "@/lib/security/crypto";
import { recordAudit, recordSecurityEvent } from "@/lib/audit/service";
import {
  providerName,
  type PayoutProviderCode,
} from "@/lib/validation/wallet";

/**
 * Wallet service (RULES.md §15).
 *
 * A USER may set the wallet exactly once. Later edits create a review request
 * instead of mutating the record. Name and account number are encrypted at rest;
 * only the last four digits are stored in plaintext for masked display.
 */

export type WalletView = {
  fullNameMasked: string;
  providerCode: string;
  providerName: string;
  accountNumberMasked: string;
  status: "ACTIVE" | "PENDING_REVIEW" | "LOCKED";
  hasPendingChange: boolean;
  createdAt: Date;
};

/** Masks a person's name to initials plus the final word. */
function maskFullName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    const only = parts[0] ?? "";
    return `${only.slice(0, 1)}${"•".repeat(Math.max(only.length - 1, 1))}`;
  }
  const initials = parts
    .slice(0, -1)
    .map((part) => `${part.slice(0, 1)}.`)
    .join(" ");
  return `${initials} ${parts[parts.length - 1]}`;
}

/**
 * Returns the caller's wallet in masked form.
 *
 * The decrypted full name is never returned; the mask is derived at write time
 * and stored alongside the ciphertext would be redundant, so it is recomputed
 * from the plaintext only during the setting operation.
 */
export async function getWalletView(
  userId: string,
): Promise<WalletView | null> {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    select: {
      providerCode: true,
      providerName: true,
      accountNumberLast4: true,
      status: true,
      createdAt: true,
      changeRequests: {
        where: { status: "PENDING" },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!wallet) {
    return null;
  }

  return {
    // The wallet holder is the account owner, so their own name is shown from
    // the account record rather than decrypted from the wallet.
    fullNameMasked: "••••",
    providerCode: wallet.providerCode,
    providerName: wallet.providerName,
    accountNumberMasked: `••••${wallet.accountNumberLast4}`,
    status: wallet.status,
    hasPendingChange: wallet.changeRequests.length > 0,
    createdAt: wallet.createdAt,
  };
}

export type SetWalletParams = {
  userId: string;
  fullName: string;
  providerCode: PayoutProviderCode;
  accountNumber: string;
  ip?: string;
};

/**
 * Sets the wallet for the first time.
 *
 * A second attempt is rejected: subsequent edits must go through
 * {@link requestWalletChange}.
 */
export async function setWallet(params: SetWalletParams): Promise<void> {
  const existing = await prisma.wallet.findUnique({
    where: { userId: params.userId },
    select: { id: true },
  });

  if (existing) {
    throw conflict(
      "Your wallet is already set. Submit a change request to update it.",
    );
  }

  const last4 = params.accountNumber.slice(-4);

  await prisma.$transaction(async (tx) => {
    await tx.wallet.create({
      data: {
        userId: params.userId,
        fullNameCiphertext: encryptToString(params.fullName),
        accountNumberCiphertext: encryptToString(params.accountNumber),
        accountNumberLast4: last4,
        providerCode: params.providerCode,
        providerName: providerName(params.providerCode),
        status: "ACTIVE",
      },
      select: { id: true },
    });

    await recordAudit(
      {
        actorUserId: params.userId,
        actorRole: "USER",
        action: "WALLET_CHANGE_REVIEW",
        resourceType: "WALLET",
        resourceId: params.userId,
        // Only masked data reaches the audit trail.
        afterSummary: {
          providerCode: params.providerCode,
          accountNumberLast4: last4,
          nameMask: maskFullName(params.fullName),
        },
        reason: "Initial wallet setup",
        ...(params.ip ? { ip: params.ip } : {}),
      },
      tx,
    );
  });

  await recordSecurityEvent({
    userId: params.userId,
    event: "WALLET_SET",
    outcome: "SUCCESS",
    ...(params.ip ? { ip: params.ip } : {}),
  });
}

/** Opens a review request to change wallet details. */
export async function requestWalletChange(
  params: SetWalletParams,
): Promise<void> {
  const wallet = await prisma.wallet.findUnique({
    where: { userId: params.userId },
    select: { id: true, status: true },
  });

  if (!wallet) {
    throw notFound("Set up your wallet before requesting a change.");
  }

  const pending = await prisma.walletChangeRequest.count({
    where: { walletId: wallet.id, status: "PENDING" },
  });
  if (pending > 0) {
    throw conflict("A wallet change request is already under review.");
  }

  const openWithdrawals = await prisma.withdrawal.count({
    where: {
      userId: params.userId,
      status: { in: ["PENDING", "PROCESSING", "APPROVED"] },
    },
  });
  if (openWithdrawals > 0) {
    throw invalidState(
      "Wait for your open withdrawal to finish before changing your wallet.",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.walletChangeRequest.create({
      data: {
        walletId: wallet.id,
        userId: params.userId,
        fullNameCiphertext: encryptToString(params.fullName),
        accountNumberCiphertext: encryptToString(params.accountNumber),
        accountNumberLast4: params.accountNumber.slice(-4),
        providerCode: params.providerCode,
        providerName: providerName(params.providerCode),
        status: "PENDING",
      },
      select: { id: true },
    });

    // Withdrawals are paused while the wallet is under review.
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { status: "PENDING_REVIEW" },
    });
  });
}

/** ADMIN decision on a pending wallet change request. */
export async function reviewWalletChange(params: {
  adminUserId: string;
  changeRequestId: string;
  decision: "APPROVE" | "REJECT";
  note?: string;
}): Promise<void> {
  const request = await prisma.walletChangeRequest.findUnique({
    where: { id: params.changeRequestId },
    select: {
      id: true,
      walletId: true,
      userId: true,
      status: true,
      fullNameCiphertext: true,
      accountNumberCiphertext: true,
      accountNumberLast4: true,
      providerCode: true,
      providerName: true,
    },
  });

  if (!request) {
    throw notFound("This change request no longer exists.");
  }
  if (request.status !== "PENDING") {
    throw invalidState("This change request has already been decided.");
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.walletChangeRequest.updateMany({
      where: { id: request.id, status: "PENDING" },
      data: {
        status: params.decision === "APPROVE" ? "APPROVED" : "REJECTED",
        reviewedByAdminId: params.adminUserId,
        reviewNote: params.note?.slice(0, 255) ?? null,
        reviewedAt: new Date(),
      },
    });

    if (updated.count !== 1) {
      throw conflict("This request was decided by someone else.");
    }

    if (params.decision === "APPROVE") {
      await tx.wallet.update({
        where: { id: request.walletId },
        data: {
          fullNameCiphertext: request.fullNameCiphertext,
          accountNumberCiphertext: request.accountNumberCiphertext,
          accountNumberLast4: request.accountNumberLast4,
          providerCode: request.providerCode,
          providerName: request.providerName,
          status: "ACTIVE",
        },
      });
    } else {
      // Rejected: restore the previous wallet to active use.
      await tx.wallet.update({
        where: { id: request.walletId },
        data: { status: "ACTIVE" },
      });
    }

    await recordAudit(
      {
        actorUserId: params.adminUserId,
        actorRole: "ADMIN",
        action: "WALLET_CHANGE_REVIEW",
        resourceType: "WALLET",
        resourceId: request.userId,
        afterSummary: {
          decision: params.decision,
          providerCode: request.providerCode,
          accountNumberLast4: request.accountNumberLast4,
        },
        reason: params.note,
      },
      tx,
    );
  });
}
