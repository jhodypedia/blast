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
  normalizeCampaignContent,
  updateCampaignSchema,
} from "@/lib/validation/campaign";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/security/rate-limit";
import { isAppError, toAppError } from "@/lib/errors";
import { logger } from "@/lib/observability/logger";
import { saveCampaignMediaUpload } from "@/lib/storage/private-storage";

/**
 * ADMIN allocation actions.
 *
 * These back the message/media/CTA/delay and per-user allocation controls on the
 * Target Nomor page. Every entry point asserts ADMIN first, then validates with
 * Zod, then delegates to the service layer. No USER-reachable action exists in
 * this file.
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
    messageType: formData.get("messageType") ?? "RICH",
    messageText: formData.get("messageText"),
    image1Key: formData.get("image1Key") ?? undefined,
    image1Mime: formData.get("image1Mime") ?? undefined,
    image2Key: formData.get("image2Key") ?? undefined,
    image2Mime: formData.get("image2Mime") ?? undefined,
    buttons: contentButtonsPayload(formData),
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

/**
 * Reads the button rows out of `FormData`.
 *
 * The form submits parallel arrays (`buttonVariant[]`, `buttonLabel[]`,
 * `buttonValue[]`) so a row keeps its position, and blank rows are dropped here
 * rather than being rejected: an admin leaving the third row empty means "two
 * buttons", not a validation error. Anything non-blank still goes through Zod.
 */
function contentButtonsPayload(formData: FormData): unknown[] {
  const variants = formData.getAll("buttonVariant").map(String);
  const labels = formData.getAll("buttonLabel").map(String);
  const values = formData.getAll("buttonValue").map(String);

  const rows: unknown[] = [];

  for (const [index, variant] of variants.entries()) {
    const label = (labels[index] ?? "").trim();
    const value = (values[index] ?? "").trim();

    if (label.length === 0 && value.length === 0) {
      continue;
    }

    rows.push({
      variant,
      label,
      ...(value.length > 0 ? { value } : {}),
    });
  }

  return rows;
}

/**
 * Persists the two content-block image uploads.
 *
 * Each slot keeps a hidden key/mime pair so an edit that does not re-upload keeps
 * its existing image, and a slot can be cleared explicitly. The second slot is
 * ignored when the first is empty; the schema rejects that combination anyway,
 * and dropping it here avoids storing an orphaned upload.
 */
async function withContentImages(
  formData: FormData,
  input: Record<string, unknown>,
) {
  const result = { ...input };

  for (const slot of [1, 2] as const) {
    const file = formData.get(`image${slot}File`);
    const cleared = formData.get(`image${slot}Clear`) === "on";

    if (cleared) {
      result[`image${slot}Key`] = undefined;
      result[`image${slot}Mime`] = undefined;
      continue;
    }

    if (!(file instanceof File) || file.size === 0) {
      continue;
    }

    const media = await saveCampaignMediaUpload({ file });
    result[`image${slot}Key`] = media.storageKey;
    result[`image${slot}Mime`] = media.mimeType;
  }

  // A legacy form post still sends `mediaFile`; keep honouring it so an older
  // client cannot silently lose its image.
  const legacyFile = formData.get("mediaFile");
  if (legacyFile instanceof File && legacyFile.size > 0) {
    const media = await saveCampaignMediaUpload({ file: legacyFile });
    result.mediaKey = media.storageKey;
    result.mediaMime = media.mimeType;
  }

  if (!result.image1Key) {
    result.image2Key = undefined;
    result.image2Mime = undefined;
  }

  return result;
}

/**
 * Builds the validated payload: uploads first, then the legacy→block upgrade.
 *
 * `normalizeCampaignContent` runs last so a payload that only carries the old
 * `mediaKey`/`ctaLabel` shape still arrives as a content block.
 */
async function allocationPayload(formData: FormData) {
  return normalizeCampaignContent(
    await withContentImages(formData, campaignFormPayload(formData)),
  );
}

export async function createCampaignAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const actor = await requireAdmin();
    await enforceRateLimit(RATE_LIMITS.adminMutation, actor.id);

    const parsed = createCampaignSchema.safeParse(
      await allocationPayload(formData),
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

    revalidatePath("/admin/target-lists");
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
      await allocationPayload(formData),
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

    revalidatePath("/admin/target-lists");
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

    revalidatePath("/admin/target-lists");
    return { status: "success", message: "Campaign updated." };
  } catch (error) {
    return toState(error);
  }
}

