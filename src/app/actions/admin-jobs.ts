"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/session";
import { stopBlastJob } from "@/lib/blast/lifecycle";
import { adminStopJobSchema } from "@/lib/validation/admin";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/security/rate-limit";
import { isAppError, toAppError } from "@/lib/errors";
import { logger } from "@/lib/observability/logger";

/**
 * ADMIN blast-job actions.
 *
 * A force-stop cancels outstanding recipients but deliberately leaves rows in
 * `SENDING` for reconciliation, so a possibly delivered message is never
 * re-sent (RULES.md §12).
 */

export type AdminJobActionState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | {
      status: "error";
      message: string;
      fieldErrors?: Record<string, string[]>;
    };

function toState(error: unknown): AdminJobActionState {
  const appError = toAppError(error);

  if (!isAppError(error) || appError.code === "INTERNAL_ERROR") {
    logger("blast").error(
      { event: "admin_job.action_failed", reason: appError.internalMessage },
      "Admin job action failed",
    );
  }

  return {
    status: "error",
    message: appError.message,
    ...(appError.fieldErrors ? { fieldErrors: appError.fieldErrors } : {}),
  };
}

export async function adminStopJobAction(
  _previous: AdminJobActionState,
  formData: FormData,
): Promise<AdminJobActionState> {
  try {
    const actor = await requireAdmin();
    await enforceRateLimit(RATE_LIMITS.adminMutation, actor.id);

    const parsed = adminStopJobSchema.safeParse({
      blastJobId: formData.get("blastJobId"),
      reason: formData.get("reason"),
    });

    if (!parsed.success) {
      return {
        status: "error",
        message: "Provide a reason for stopping this job.",
      };
    }

    // Audited inside the lifecycle service because it is an ADMIN action.
    await stopBlastJob({
      blastJobId: parsed.data.blastJobId,
      actorUserId: actor.id,
      actorRole: "ADMIN",
      reason: parsed.data.reason,
    });

    revalidatePath("/admin/jobs");
    return { status: "success", message: "Job stopped." };
  } catch (error) {
    return toState(error);
  }
}
