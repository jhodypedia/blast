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

const campaignBaseSchema = z.object({
  name: z.string().trim().min(3, "Name must be at least 3 characters").max(120),
  description: z
    .string()
    .trim()
    .min(1, "Description is required")
    .max(500, "Description must be at most 500 characters"),
  internalNotes: z.string().trim().max(2000).optional(),

  messageText: z
    .string()
    .trim()
    .min(1, "Message text is required")
    .max(4096, "Message must be at most 4096 characters"),
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
    });

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
