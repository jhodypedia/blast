"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { requireAdmin } from "@/lib/auth/session";
import {
  createCampaign,
  transitionCampaign,
  updateCampaign,
} from "@/lib/campaign/service";
import {
  campaignTransitionSchema,
  createCampaignSchema,
  updateCampaignSchema,
} from "@/lib/validation/campaign";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/security/rate-limit";
import { isAppError, toAppError } from "@/lib/errors";
import { logger } from "@/lib/observability/logger";
import { saveCampaignMediaUpload } from "@/lib/storage/private-storage";

/**
 * ADMIN campaign actions.
 *
 * Every entry point asserts ADMIN first, then validates with Zod, then delegates
 * to the campaign service. No USER-reachable action exists in this file.
 */

export type AdminActionState =
  | { status: "idle" }
  | { status: "success"; message: string; campaignId?: string }
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
    logger("campaign").error(
      { event: "campaign.action_failed", reason: appError.internalMessage },
      "Campaign action failed",
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

/** Reads the campaign form out of `FormData` without trusting any of it. */
function campaignFormPayload(formData: FormData) {
  return {
    name: formData.get("name"),
    description: formData.get("description"),
    internalNotes: formData.get("internalNotes") ?? undefined,
    messageText: formData.get("messageText"),
    mediaKey: formData.get("mediaKey") ?? undefined,
    mediaMime: formData.get("mediaMime") ?? undefined,
    mediaCaption: formData.get("mediaCaption") ?? undefined,
    ctaLabel: formData.get("ctaLabel") ?? undefined,
    ctaUrl: formData.get("ctaUrl") ?? undefined,
    targetListId: formData.get("targetListId"),
    deviceModePolicy: formData.get("deviceModePolicy"),
    allowedSpeeds: formData
      .getAll("allowedSpeeds")
      .map((value) => Number(value)),
    payoutPerSend: formData.get("payoutPerSend"),
    currency: formData.get("currency"),
    quotaPerUser: formData.get("quotaPerUser"),
    maxConcurrentJobs: formData.get("maxConcurrentJobs") ?? 1,
    assignmentPolicy: formData.get("assignmentPolicy"),
    assignedUserIds: formData.getAll("assignedUserIds").map(String),
    allowUserPause: formData.get("allowUserPause") === "on",
    requireTermsAccept: formData.get("requireTermsAccept") === "on",
    retryLimit: formData.get("retryLimit") ?? 2,
    scheduledStartAt: formData.get("scheduledStartAt"),
    scheduledEndAt: formData.get("scheduledEndAt"),
  };
}

async function withCampaignMedia(formData: FormData, input: Record<string, unknown>) {
  const mediaFile = formData.get("mediaFile");
  if (!(mediaFile instanceof File) || mediaFile.size === 0) return input;
  const media = await saveCampaignMediaUpload({ file: mediaFile });
  return { ...input, mediaKey: media.storageKey, mediaMime: media.mimeType };
}

export async function createCampaignAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const actor = await requireAdmin();
    await enforceRateLimit(RATE_LIMITS.adminMutation, actor.id);

    const parsed = createCampaignSchema.safeParse(
      await withCampaignMedia(formData, campaignFormPayload(formData)),
    );

    if (!parsed.success) {
      return {
        status: "error",
        message: "Check the highlighted fields and try again.",
        fieldErrors: fieldErrorsOf(parsed.error),
      };
    }

    const result = await createCampaign({
      adminUserId: actor.id,
      input: parsed.data,
      ip: await clientIp(),
    });

    revalidatePath("/admin/campaigns");
    return {
      status: "success",
      message: "Campaign created as a draft.",
      campaignId: result.campaignId,
    };
  } catch (error) {
    return toState(error);
  }
}

export async function updateCampaignAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const actor = await requireAdmin();
    await enforceRateLimit(RATE_LIMITS.adminMutation, actor.id);

    const campaignId = formData.get("campaignId");
    if (typeof campaignId !== "string" || campaignId.length === 0) {
      return { status: "error", message: "That campaign could not be found." };
    }

    const parsed = updateCampaignSchema.safeParse(
      await withCampaignMedia(formData, campaignFormPayload(formData)),
    );

    if (!parsed.success) {
      return {
        status: "error",
        message: "Check the highlighted fields and try again.",
        fieldErrors: fieldErrorsOf(parsed.error),
      };
    }

    await updateCampaign({
      adminUserId: actor.id,
      campaignId,
      input: parsed.data,
      ip: await clientIp(),
    });

    revalidatePath("/admin/campaigns");
    revalidatePath(`/admin/campaigns/${campaignId}`);
    return { status: "success", message: "Campaign updated." };
  } catch (error) {
    return toState(error);
  }
}

export async function campaignTransitionAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const actor = await requireAdmin();
    await enforceRateLimit(RATE_LIMITS.adminMutation, actor.id);

    const parsed = campaignTransitionSchema.safeParse({
      campaignId: formData.get("campaignId"),
      action: formData.get("action"),
      reason: formData.get("reason") ?? undefined,
    });

    if (!parsed.success) {
      return {
        status: "error",
        message: "That transition is not valid.",
        fieldErrors: fieldErrorsOf(parsed.error),
      };
    }

    await transitionCampaign({
      adminUserId: actor.id,
      input: parsed.data,
      ip: await clientIp(),
    });

    revalidatePath("/admin/campaigns");
    revalidatePath(`/admin/campaigns/${parsed.data.campaignId}`);
    return { status: "success", message: "Campaign updated." };
  } catch (error) {
    return toState(error);
  }
}

