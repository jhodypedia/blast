"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/session";
import { adjustBalance, reviewWithdrawal } from "@/lib/withdrawal/service";
import { reviewWalletChange } from "@/lib/wallet/service";
import {
  adjustBalanceSchema,
  reviewWithdrawalSchema,
} from "@/lib/validation/wallet";
import { reviewWalletChangeSchema } from "@/lib/validation/admin";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/security/rate-limit";
import { isAppError, toAppError, validationError } from "@/lib/errors";
import { logger } from "@/lib/observability/logger";

/**
 * ADMIN money actions: withdrawal review, wallet-change review and manual
 * balance adjustment.
 *
 * A USER can never reach these: `requireAdmin()` rejects USER sessions, and the
 * user-facing cancel path lives in `actions/wallet.ts` with an ownership check.
 */

export type AdminMoneyActionState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | {
      status: "error";
      message: string;
      fieldErrors?: Record<string, string[]>;
    };

function toState(error: unknown): AdminMoneyActionState {
  const appError = toAppError(error);

  if (!isAppError(error) || appError.code === "INTERNAL_ERROR") {
    logger("withdrawal").error(
      { event: "admin_money.action_failed", reason: appError.internalMessage },
      "Admin money action failed",
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

export async function reviewWithdrawalAction(
  _previous: AdminMoneyActionState,
  formData: FormData,
): Promise<AdminMoneyActionState> {
  try {
    const actor = await requireAdmin();
    await enforceRateLimit(RATE_LIMITS.adminMutation, actor.id);

    const parsed = reviewWithdrawalSchema.safeParse({
      withdrawalId: formData.get("withdrawalId"),
      action: formData.get("action"),
      note: formData.get("note") ?? undefined,
      rejectionReason: formData.get("rejectionReason") ?? undefined,
      payoutReference: formData.get("payoutReference") ?? undefined,
    });

    if (!parsed.success) {
      return {
        status: "error",
        message: "Check the highlighted fields and try again.",
        fieldErrors: fieldErrorsOf(parsed.error),
      };
    }

    // CANCEL is the operator's own path; an admin must reject instead so the
    // decision is attributed and auditable.
    if (parsed.data.action === "CANCEL") {
      throw validationError("Use reject to decline a withdrawal request.", {
        action: ["Cancel is only available to the requester"],
      });
    }

    await reviewWithdrawal({
      adminUserId: actor.id,
      withdrawalId: parsed.data.withdrawalId,
      action: parsed.data.action,
      note: parsed.data.note,
      rejectionReason: parsed.data.rejectionReason,
      payoutReference: parsed.data.payoutReference,
    });

    revalidatePath("/admin/withdrawals");
    return { status: "success", message: "Withdrawal updated." };
  } catch (error) {
    return toState(error);
  }
}

export async function reviewWalletChangeAction(
  _previous: AdminMoneyActionState,
  formData: FormData,
): Promise<AdminMoneyActionState> {
  try {
    const actor = await requireAdmin();
    await enforceRateLimit(RATE_LIMITS.adminMutation, actor.id);

    const parsed = reviewWalletChangeSchema.safeParse({
      changeRequestId: formData.get("changeRequestId"),
      decision: formData.get("decision"),
      note: formData.get("note") ?? undefined,
    });

    if (!parsed.success) {
      return {
        status: "error",
        message: "Check the highlighted fields and try again.",
        fieldErrors: fieldErrorsOf(parsed.error),
      };
    }

    await reviewWalletChange({
      adminUserId: actor.id,
      changeRequestId: parsed.data.changeRequestId,
      decision: parsed.data.decision,
      note: parsed.data.note,
    });

    revalidatePath("/admin/wallet-requests");
    return { status: "success", message: "Wallet change request decided." };
  } catch (error) {
    return toState(error);
  }
}

export async function adjustBalanceAction(
  _previous: AdminMoneyActionState,
  formData: FormData,
): Promise<AdminMoneyActionState> {
  try {
    const actor = await requireAdmin();
    await enforceRateLimit(RATE_LIMITS.adminMutation, actor.id);

    const parsed = adjustBalanceSchema.safeParse({
      userId: formData.get("userId"),
      direction: formData.get("direction"),
      amount: formData.get("amount"),
      reason: formData.get("reason"),
    });

    if (!parsed.success) {
      return {
        status: "error",
        message: "Check the highlighted fields and try again.",
        fieldErrors: fieldErrorsOf(parsed.error),
      };
    }

    await adjustBalance({
      adminUserId: actor.id,
      userId: parsed.data.userId,
      direction: parsed.data.direction,
      amount: parsed.data.amount,
      reason: parsed.data.reason,
    });

    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${parsed.data.userId}`);
    return { status: "success", message: "Balance adjusted." };
  } catch (error) {
    return toState(error);
  }
}

