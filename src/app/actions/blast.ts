"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { startBlastJob } from "@/lib/blast/start-job";
import {
  pauseBlastJob,
  resumeBlastJob,
  stopBlastJob,
} from "@/lib/blast/lifecycle";
import {
  blastJobActionSchema,
  startBlastSchema,
} from "@/lib/validation/device";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/security/rate-limit";
import { prisma } from "@/lib/db/prisma";
import { forbidden, isAppError, toAppError } from "@/lib/errors";
import { logger } from "@/lib/observability/logger";

/**
 * Blast-job server actions.
 *
 * USER-only. Every value that affects money, content or targeting is read from
 * the campaign by the service layer — the client sends identifiers and a speed
 * and nothing else (RULES.md §11).
 */

export type BlastActionState =
  | { status: "idle" }
  | { status: "success"; message: string; blastJobId?: string }
  | {
      status: "error";
      message: string;
      fieldErrors?: Record<string, string[]>;
    };

function toState(error: unknown): BlastActionState {
  const appError = toAppError(error);

  if (!isAppError(error) || appError.code === "INTERNAL_ERROR") {
    logger("blast").error(
      { event: "blast.action_failed", reason: appError.internalMessage },
      "Blast action failed",
    );
  }

  return {
    status: "error",
    message: appError.message,
    ...(appError.fieldErrors ? { fieldErrors: appError.fieldErrors } : {}),
  };
}

export async function startBlastAction(
  _previous: BlastActionState,
  formData: FormData,
): Promise<BlastActionState> {
  try {
    const actor = await requireUser();

    const parsed = startBlastSchema.safeParse({
      campaignId: formData.get("campaignId"),
      deviceId: formData.get("deviceId"),
      speedSeconds: formData.get("speedSeconds"),
      acceptedTerms: formData.get("acceptedTerms") === "on",
    });

    if (!parsed.success) {
      return {
        status: "error",
        message: "Check the selected device and speed, then try again.",
        fieldErrors: {
          speedSeconds: ["Choose an allowed sending speed"],
        },
      };
    }

    await enforceRateLimit(RATE_LIMITS.blastStart, actor.id);

    const result = await startBlastJob({
      userId: actor.id,
      campaignId: parsed.data.campaignId,
      deviceId: parsed.data.deviceId,
      speedSeconds: parsed.data.speedSeconds,
      acceptedTerms: parsed.data.acceptedTerms,
    });

    revalidatePath("/dashboard/jobs");
    revalidatePath("/dashboard/campaigns");

    return {
      status: "success",
      message: result.deduplicated
        ? "This job is already running."
        : `Job queued for ${result.quotaTotal} recipients.`,
      blastJobId: result.blastJobId,
    };
  } catch (error) {
    return toState(error);
  }
}

export async function blastJobControlAction(
  _previous: BlastActionState,
  formData: FormData,
): Promise<BlastActionState> {
  try {
    const actor = await requireUser();

    const parsed = blastJobActionSchema.safeParse({
      blastJobId: formData.get("blastJobId"),
      action: formData.get("action"),
      reason: formData.get("reason") ?? undefined,
    });

    if (!parsed.success) {
      return { status: "error", message: "That action is not available." };
    }

    // Ownership is verified again inside the lifecycle service; this early check
    // keeps a foreign job id from reaching it at all.
    const owner = await prisma.blastJob.findUnique({
      where: { id: parsed.data.blastJobId },
      select: { userId: true },
    });
    if (!owner || owner.userId !== actor.id) {
      throw forbidden("You can only control your own blast jobs.");
    }

    switch (parsed.data.action) {
      case "PAUSE":
        await pauseBlastJob({
          blastJobId: parsed.data.blastJobId,
          actorUserId: actor.id,
          actorRole: "USER",
        });
        break;
      case "RESUME":
        await resumeBlastJob({
          blastJobId: parsed.data.blastJobId,
          actorUserId: actor.id,
          actorRole: "USER",
        });
        break;
      case "STOP":
        await stopBlastJob({
          blastJobId: parsed.data.blastJobId,
          actorUserId: actor.id,
          actorRole: "USER",
          ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
        });
        break;
    }

    revalidatePath("/dashboard/jobs");

    return { status: "success", message: "Job updated." };
  } catch (error) {
    return toState(error);
  }
}

/** Reads the caller's own job progress. Counts come from recipient rows. */
export async function getOwnJobProgress(blastJobId: string) {
  const actor = await requireUser();

  const job = await prisma.blastJob.findUnique({
    where: { id: blastJobId },
    select: { userId: true, status: true, quotaTotal: true },
  });

  if (!job || job.userId !== actor.id) {
    throw forbidden("You can only view your own blast jobs.");
  }

  const { blastJobProgress, completionPercent } = await import(
    "@/lib/delivery/progress"
  );
  const counts = await blastJobProgress(blastJobId);

  return {
    status: job.status,
    quotaTotal: job.quotaTotal,
    counts,
    percent: completionPercent(counts),
  };
}
