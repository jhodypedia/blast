"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  getWalletView,
  requestWalletChange,
  setWallet,
} from "@/lib/wallet/service";
import { requestWithdrawal, reviewWithdrawal } from "@/lib/withdrawal/service";
import {
  requestWithdrawalSchema,
  setWalletSchema,
} from "@/lib/validation/wallet";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/security/rate-limit";
import { verifyPassword } from "@/lib/security/password";
import { recordSecurityEvent } from "@/lib/audit/service";
import { isAppError, toAppError, validationError } from "@/lib/errors";
import { logger } from "@/lib/observability/logger";

/**
 * Wallet and withdrawal server actions (RULES.md §15).
 *
 * Money-moving actions require Turnstile, a rate limit, and password
 * re-authentication. The amount is the only client input; fee, net amount and
 * the balance check are all computed server-side.
 */

export type WalletActionState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | {
      status: "error";
      message: string;
      fieldErrors?: Record<string, string[]>;
    };

async function clientIp(): Promise<string> {
  const headerList = await headers();
  return (
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerList.get("x-real-ip") ??
    "unknown"
  );
}

function toState(error: unknown): WalletActionState {
  const appError = toAppError(error);

  if (!isAppError(error) || appError.code === "INTERNAL_ERROR") {
    logger("withdrawal").error(
      { event: "wallet.action_failed", reason: appError.internalMessage },
      "Wallet action failed",
    );
  }

  return {
    status: "error",
    message: appError.message,
    ...(appError.fieldErrors ? { fieldErrors: appError.fieldErrors } : {}),
  };
}

function fieldErrorsOf(error: {
  flatten: () => { fieldErrors: Record<string, string[] | undefined> };
}): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(error.flatten().fieldErrors)) {
    if (value) {
      result[key] = value;
    }
  }
  return result;
}

export async function setWalletAction(
  _previous: WalletActionState,
  formData: FormData,
): Promise<WalletActionState> {
  try {
    const actor = await requireUser();

    const parsed = setWalletSchema.safeParse({
      fullName: formData.get("fullName"),
      providerCode: formData.get("providerCode"),
      accountNumber: formData.get("accountNumber"),
      confirmAccountNumber: formData.get("confirmAccountNumber"),
      turnstileToken: formData.get("turnstileToken"),
    });

    if (!parsed.success) {
      return {
        status: "error",
        message: "Check the highlighted fields and try again.",
        fieldErrors: fieldErrorsOf(parsed.error),
      };
    }

    const ip = await clientIp();
    await enforceRateLimit(RATE_LIMITS.walletSet, actor.id);
    await verifyTurnstileToken(parsed.data.turnstileToken, {
      remoteIp: ip,
      action: "wallet",
    });

    const existing = await getWalletView(actor.id);

    if (existing) {
      // A wallet may only be set once; further edits go through review.
      await requestWalletChange({
        userId: actor.id,
        fullName: parsed.data.fullName,
        providerCode: parsed.data.providerCode,
        accountNumber: parsed.data.accountNumber,
        ip,
      });

      revalidatePath("/dashboard/wallet");
      return {
        status: "success",
        message:
          "Change request submitted. Withdrawals are paused until it is reviewed.",
      };
    }

    await setWallet({
      userId: actor.id,
      fullName: parsed.data.fullName,
      providerCode: parsed.data.providerCode,
      accountNumber: parsed.data.accountNumber,
      ip,
    });

    revalidatePath("/dashboard/wallet");
    return { status: "success", message: "Withdrawal wallet saved." };
  } catch (error) {
    return toState(error);
  }
}

export async function requestWithdrawalAction(
  _previous: WalletActionState,
  formData: FormData,
): Promise<WalletActionState> {
  try {
    const actor = await requireUser();

    const parsed = requestWithdrawalSchema.safeParse({
      amount: formData.get("amount"),
      password: formData.get("password"),
      turnstileToken: formData.get("turnstileToken"),
      confirm: formData.get("confirm") === "on",
    });

    if (!parsed.success) {
      return {
        status: "error",
        message: "Check the amount and confirmation, then try again.",
        fieldErrors: fieldErrorsOf(parsed.error),
      };
    }

    const ip = await clientIp();
    await enforceRateLimit(RATE_LIMITS.withdrawalRequest, actor.id);
    await verifyTurnstileToken(parsed.data.turnstileToken, {
      remoteIp: ip,
      action: "withdrawal",
    });

    // Re-authenticate before moving money.
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: actor.id },
      select: { passwordHash: true },
    });
    if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
      throw validationError("Your password is incorrect.", {
        password: ["Incorrect password"],
      });
    }

    const result = await requestWithdrawal({
      userId: actor.id,
      requestedAmount: parsed.data.amount,
    });

    await recordSecurityEvent({
      userId: actor.id,
      event: "WITHDRAWAL_REQUESTED",
      outcome: "SUCCESS",
      ip,
      detail: { withdrawalId: result.withdrawalId },
    });

    revalidatePath("/dashboard/wallet");
    revalidatePath("/dashboard/earnings");

    return {
      status: "success",
      message: `Withdrawal requested. Net payout: ${result.netAmount} ${result.currency}.`,
    };
  } catch (error) {
    return toState(error);
  }
}

export async function cancelWithdrawalAction(
  _previous: WalletActionState,
  formData: FormData,
): Promise<WalletActionState> {
  try {
    const actor = await requireUser();
    const withdrawalId = formData.get("withdrawalId");

    if (typeof withdrawalId !== "string" || withdrawalId.length === 0) {
      return { status: "error", message: "That request could not be found." };
    }

    // `actingUserId` makes the service enforce owner-only cancellation.
    await reviewWithdrawal({
      adminUserId: actor.id,
      actingUserId: actor.id,
      withdrawalId,
      action: "CANCEL",
      rejectionReason: "Cancelled by the requester",
    });

    revalidatePath("/dashboard/wallet");
    return { status: "success", message: "Withdrawal request cancelled." };
  } catch (error) {
    return toState(error);
  }
}
