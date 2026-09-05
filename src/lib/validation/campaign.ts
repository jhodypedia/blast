import { z } from "zod";

import { ALLOWED_SPEED_SECONDS } from "@/lib/constants";
import { cuidSchema, moneyStringSchema } from "@/lib/validation/common";

/**
 * Campaign schemas — ADMIN only. There is deliberately no USER-facing schema
 * that can mutate any campaign field (RULES.md §6).
 */

const speedSchema = z.union([
  z.literal(1),
  z.literal(3),
  z.literal(6),
  z.literal(10),
]);

export const allowedSpeedsSchema = z
  .array(speedSchema)
  .min(1, "Select at least one sending speed")
  .max(ALLOWED_SPEED_SECONDS.length)
  .refine((values) => new Set(values).size === values.length, {
    message: "Sending speeds must be unique",
  });

/**
 * Baileys message shape.
 *
 * `RICH` is the current model: one unified content block that may combine one or
 * two images, the message text and up to three buttons, all delivered as a single
 * WhatsApp message. `TEXT`/`IMAGE`/`BUTTON` are retained so allocations created
 * before the unified block keep validating and keep sending what they always
 * sent; the cross-field rules below still enforce their narrower requirements.
 */
export const messageTypeSchema = z.enum(["TEXT", "IMAGE", "BUTTON", "RICH"]);

export type MessageTypeInput = z.infer<typeof messageTypeSchema>;

/** Interactive button variants an ADMIN may attach to a content block. */
export const buttonVariantSchema = z.enum(["URL", "REPLY", "COPY", "CALL"]);

export type ButtonVariantInput = z.infer<typeof buttonVariantSchema>;

export const MAX_CONTENT_BUTTONS = 3;

/**
 * One button in the content block.
 *
 * `value` carries the variant's payload — a URL, a phone number or a copyable
 * code — and is validated per variant so an admin cannot save a URL button
 * without a URL. `REPLY` needs no payload: the id is derived server-side.
 */
export const contentButtonSchema = z
  .object({
    variant: buttonVariantSchema,
    label: z
      .string()
      .trim()
      .min(1, "Button label is required")
      .max(64, "Button label must be at most 64 characters"),
    value: z.string().trim().max(2048).optional(),
  })
  .superRefine((button, ctx) => {
    if (button.variant === "REPLY") {
      return;
    }

    const value = button.value?.trim();

    if (!value) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message:
          button.variant === "URL"
            ? "Enter the button URL"
            : button.variant === "CALL"
              ? "Enter the phone number to call"
              : "Enter the code to copy",
      });
      return;
    }

    if (button.variant === "URL" && !z.string().url().safeParse(value).success) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "Enter a valid URL",
      });
    }

    if (button.variant === "CALL" && !/^\+?[0-9\s()-]{6,24}$/.test(value)) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "Enter a valid phone number",
      });
    }
  });

export type ContentButtonInput = z.infer<typeof contentButtonSchema>;

/**
 * Form-friendly button row.
 *
 * Every field is present and `value` is blank rather than absent, so the admin
 * form can bind it to controlled inputs and the empty rows round-trip cleanly.
 */
export type ContentButtonFormValue = {
  variant: ButtonVariantInput;
  label: string;
  value: string;
};

export const contentButtonsSchema = z
  .array(contentButtonSchema)
  .max(MAX_CONTENT_BUTTONS, `Use at most ${MAX_CONTENT_BUTTONS} buttons`)
  .default([]);

const imageKeySchema = z.string().trim().max(512).optional();
const imageMimeSchema = z.string().trim().max(127).optional();

const campaignBaseSchema = z.object({
  name: z.string().trim().min(3, "Name must be at least 3 characters").max(120),
  description: z
    .string()
    .trim()
    .min(1, "Description is required")
    .max(500, "Description must be at most 500 characters"),
  internalNotes: z.string().trim().max(2000).optional(),

  messageType: messageTypeSchema.default("RICH"),
  messageText: z
    .string()
    .trim()
    .min(1, "Message text is required")
    .max(4096, "Message must be at most 4096 characters"),

  // --- Unified content block ------------------------------------------------
  image1Key: imageKeySchema,
  image1Mime: imageMimeSchema,
  image2Key: imageKeySchema,
  image2Mime: imageMimeSchema,
  buttons: contentButtonsSchema,

  // --- Legacy content fields ------------------------------------------------
  // Kept so an allocation saved before the unified block still validates. The
  // normaliser below upgrades them into the block, and the service persists both.
  mediaKey: z.string().trim().max(512).optional(),
  mediaMime: z.string().trim().max(127).optional(),
  mediaCaption: z.string().trim().max(1024).optional(),
  ctaLabel: z.string().trim().max(64).optional(),
  ctaUrl: z.string().trim().url("Enter a valid URL").max(2048).optional(),

  targetListId: cuidSchema,
  deviceModePolicy: z.enum(["SINGLE_DEVICE", "ALL_DEVICES"]),
  allowedSpeeds: allowedSpeedsSchema,
  payoutPerSend: moneyStringSchema,
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .length(3, "Currency must be a 3-letter code"),
  quotaPerUser: z.coerce
    .number()
    .int("Quota must be a whole number")
    .min(1, "Quota must be at least 1")
    .max(1_000_000),
  maxConcurrentJobs: z.coerce.number().int().min(1).max(100).default(1),
  assignmentPolicy: z.enum(["ALL_ELIGIBLE", "SELECTED_USERS"]),
  assignedUserIds: z.array(cuidSchema).max(5_000).default([]),
  allowUserPause: z.boolean().default(true),
  requireTermsAccept: z.boolean().default(false),
  retryLimit: z.coerce.number().int().min(0).max(5).default(2),

  scheduledStartAt: z.coerce.date(),
  scheduledEndAt: z.coerce.date(),
});

const withCrossFieldRules = <T extends typeof campaignBaseSchema>(schema: T) =>
  schema
    .refine((data) => data.scheduledEndAt > data.scheduledStartAt, {
      path: ["scheduledEndAt"],
      message: "End time must be after the start time",
    })
    .refine(
      (data) =>
        data.assignmentPolicy !== "SELECTED_USERS" ||
        data.assignedUserIds.length > 0,
      {
        path: ["assignedUserIds"],
        message: "Select at least one operator for a restricted campaign",
      },
    )
    .refine((data) => !data.ctaLabel || Boolean(data.ctaUrl), {
      path: ["ctaUrl"],
      message: "A call-to-action label requires a URL",
    })
    .refine((data) => !data.mediaKey || Boolean(data.mediaMime), {
      path: ["mediaMime"],
      message: "Media requires a content type",
    })
    // Each image key must travel with its own content type, so the sender never
    // has to guess a mime type at send time.
    .refine((data) => !data.image1Key || Boolean(data.image1Mime), {
      path: ["image1Mime"],
      message: "The first image requires a content type",
    })
    .refine((data) => !data.image2Key || Boolean(data.image2Mime), {
      path: ["image2Mime"],
      message: "The second image requires a content type",
    })
    // A second image without a first would silently become the only image.
    .refine((data) => !data.image2Key || Boolean(data.image1Key), {
      path: ["image1Key"],
      message: "Upload the first image before the second",
    })
    // The legacy message type is still the contract those rows' sender reads, so
    // the fields it needs must be present at validation time, not at send time.
    .refine(
      (data) =>
        data.messageType !== "IMAGE" ||
        (Boolean(data.mediaKey) && Boolean(data.mediaMime)) ||
        (Boolean(data.image1Key) && Boolean(data.image1Mime)),
      {
        path: ["mediaKey"],
        message: "An image message requires an uploaded image",
      },
    )
    .refine(
      (data) =>
        data.messageType !== "BUTTON" ||
        (Boolean(data.ctaLabel) && Boolean(data.ctaUrl)) ||
        data.buttons.length > 0,
      {
        path: ["ctaLabel"],
        message: "A button message requires a button label and URL",
      },
    );

/**
 * Upgrades a legacy payload into the unified content block.
 *
 * Accepts what the pre-block admin form submitted (`mediaKey`/`mediaMime` plus a
 * single `ctaLabel`/`ctaUrl`) and mirrors it onto `image1*`/`buttons`, so an old
 * form post, an old API client and the migration backfill all converge on the
 * same shape. Runs before parsing, and never overwrites a value the caller already
 * supplied for the block itself.
 */
export function normalizeCampaignContent<T extends Record<string, unknown>>(
  input: T,
): T {
  const result: Record<string, unknown> = { ...input };

  const asText = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : undefined;

  const image1Key = asText(result.image1Key);
  const mediaKey = asText(result.mediaKey);
  const mediaMime = asText(result.mediaMime);

  if (!image1Key && mediaKey && mediaMime) {
    result.image1Key = mediaKey;
    result.image1Mime = mediaMime;
  }

  const buttons = result.buttons;
  const hasButtons = Array.isArray(buttons) && buttons.length > 0;
  const ctaLabel = asText(result.ctaLabel);
  const ctaUrl = asText(result.ctaUrl);

  if (!hasButtons && ctaLabel && ctaUrl) {
    result.buttons = [{ variant: "URL", label: ctaLabel, value: ctaUrl }];
  }

  return result as T;
}

export const createCampaignSchema = withCrossFieldRules(campaignBaseSchema);
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const updateCampaignSchema = withCrossFieldRules(campaignBaseSchema);
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;

/** Campaign lifecycle transitions an ADMIN may request. */
export const campaignTransitionSchema = z.object({
  campaignId: cuidSchema,
  action: z.enum([
    "SCHEDULE",
    "ACTIVATE",
    "PAUSE",
    "RESUME",
    "CANCEL",
    "ARCHIVE",
  ]),
  reason: z.string().trim().max(255).optional(),
});

export type CampaignTransitionInput = z.infer<typeof campaignTransitionSchema>;

export const campaignListQuerySchema = z.object({
  status: z
    .enum([
      "DRAFT",
      "SCHEDULED",
      "ACTIVE",
      "PAUSED",
      "COMPLETED",
      "PARTIAL_FAILED",
      "CANCELLED",
      "EXPIRED",
      "ARCHIVED",
    ])
    .optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(20),
});
