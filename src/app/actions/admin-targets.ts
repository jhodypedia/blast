"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { requireAdmin } from "@/lib/auth/session";
import {
  archiveTargetList,
  createTargetListFromUpload,
} from "@/lib/target/list-service";
import {
  archiveTargetListSchema,
  createTargetListSchema,
} from "@/lib/validation/target";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/security/rate-limit";
import { isAppError, toAppError, validationError } from "@/lib/errors";
import { logger } from "@/lib/observability/logger";

/**
 * ADMIN target-list actions.
 *
 * The upload is handed straight to the storage layer and then to BullMQ; this
 * action never reads or parses the file contents (RULES.md §10).
 */

export type TargetActionState =
  | { status: "idle" }
  | { status: "success"; message: string; targetListId?: string }
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

function toState(error: unknown): TargetActionState {
  const appError = toAppError(error);

  if (!isAppError(error) || appError.code === "INTERNAL_ERROR") {
    logger("target").error(
      { event: "target.action_failed", reason: appError.internalMessage },
      "Target list action failed",
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

export async function uploadTargetListAction(
  _previous: TargetActionState,
  formData: FormData,
): Promise<TargetActionState> {
  try {
    const actor = await requireAdmin();
    await enforceRateLimit(RATE_LIMITS.targetUpload, actor.id);

    const parsed = createTargetListSchema.safeParse({
      name: formData.get("name"),
      defaultCountryCode: formData.get("defaultCountryCode") ?? undefined,
    });

    if (!parsed.success) {
      return {
        status: "error",
        message: "Check the highlighted fields and try again.",
        fieldErrors: fieldErrorsOf(parsed.error),
      };
    }

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw validationError("Choose a .txt or .csv file to upload.", {
        file: ["A file is required"],
      });
    }

    const result = await createTargetListFromUpload({
      adminUserId: actor.id,
      name: parsed.data.name,
      file,
      defaultCountryCode: parsed.data.defaultCountryCode,
      ip: await clientIp(),
    });

    revalidatePath("/admin/target-lists");
    return {
      status: "success",
      message: "Upload accepted. The import is running in the background.",
      targetListId: result.targetListId,
    };
  } catch (error) {
    return toState(error);
  }
}

export async function archiveTargetListAction(
  _previous: TargetActionState,
  formData: FormData,
): Promise<TargetActionState> {
  try {
    const actor = await requireAdmin();
    await enforceRateLimit(RATE_LIMITS.adminMutation, actor.id);

    const parsed = archiveTargetListSchema.safeParse({
      targetListId: formData.get("targetListId"),
      reason: formData.get("reason") ?? undefined,
    });

    if (!parsed.success) {
      return {
        status: "error",
        message: "That target list could not be found.",
        fieldErrors: fieldErrorsOf(parsed.error),
      };
    }

    await archiveTargetList({
      adminUserId: actor.id,
      targetListId: parsed.data.targetListId,
      reason: parsed.data.reason,
      ip: await clientIp(),
    });

    revalidatePath("/admin/target-lists");
    return { status: "success", message: "Target list archived." };
  } catch (error) {
    return toState(error);
  }
}
