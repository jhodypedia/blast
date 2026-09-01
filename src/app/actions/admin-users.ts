"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { requireAdmin } from "@/lib/auth/session";
import { applyUserAction, updateSetting } from "@/lib/admin/service";
import { updateSettingSchema, userActionSchema } from "@/lib/validation/admin";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/security/rate-limit";
import { isAppError, toAppError } from "@/lib/errors";
import { logger } from "@/lib/observability/logger";

/**
 * ADMIN user and settings actions.
 *
 * The acting admin id always comes from the session; the form only supplies the
 * target user id, which the service re-checks against its own rules.
 */

export type AdminActionState =
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

function toState(error: unknown): AdminActionState {
  const appError = toAppError(error);

  if (!isAppError(error) || appError.code === "INTERNAL_ERROR") {
    logger("security").error(
      { event: "admin.action_failed", reason: appError.internalMessage },
      "Admin action failed",
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

export async function userAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const actor = await requireAdmin();
    await enforceRateLimit(RATE_LIMITS.adminMutation, actor.id);

    const parsed = userActionSchema.safeParse({
      userId: formData.get("userId"),
      action: formData.get("action"),
      reason: formData.get("reason") ?? undefined,
    });

    if (!parsed.success) {
      return {
        status: "error",
        message: "Check the highlighted fields and try again.",
        fieldErrors: fieldErrorsOf(parsed.error),
      };
    }

    await applyUserAction({
      adminUserId: actor.id,
      input: parsed.data,
      ip: await clientIp(),
    });

    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${parsed.data.userId}`);
    return { status: "success", message: "Account updated." };
  } catch (error) {
    return toState(error);
  }
}

export async function updateSettingAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const actor = await requireAdmin();
    await enforceRateLimit(RATE_LIMITS.adminMutation, actor.id);

    const parsed = updateSettingSchema.safeParse({
      key: formData.get("key"),
      value: formData.get("value"),
    });

    if (!parsed.success) {
      return {
        status: "error",
        message: "Check the highlighted fields and try again.",
        fieldErrors: fieldErrorsOf(parsed.error),
      };
    }

    await updateSetting({
      adminUserId: actor.id,
      key: parsed.data.key,
      rawJsonValue: parsed.data.value,
      ip: await clientIp(),
    });

    revalidatePath("/admin/settings");
    return { status: "success", message: "Setting saved." };
  } catch (error) {
    return toState(error);
  }
}
