import "server-only";

import { z } from "zod";

import { cuidSchema, optionalTrimmedString } from "@/lib/validation/common";
import { isSettingKey } from "@/lib/settings/registry";

/**
 * ADMIN-only schemas for user management, wallet-change review and settings.
 *
 * Setting values are re-validated against the settings registry inside the
 * service, so this schema only asserts that the key is known.
 */

export const reviewWalletChangeSchema = z.object({
  changeRequestId: cuidSchema,
  decision: z.enum(["APPROVE", "REJECT"]),
  note: optionalTrimmedString(255),
});

export type ReviewWalletChangeInput = z.infer<typeof reviewWalletChangeSchema>;

export const userActionSchema = z
  .object({
    userId: cuidSchema,
    action: z.enum(["SUSPEND", "REACTIVATE", "FORCE_LOGOUT"]),
    reason: optionalTrimmedString(255),
  })
  .refine((data) => data.action !== "SUSPEND" || Boolean(data.reason), {
    path: ["reason"],
    message: "Give a reason for the suspension",
  });

export type UserActionInput = z.infer<typeof userActionSchema>;

export const updateSettingSchema = z.object({
  key: z
    .string()
    .trim()
    .max(96)
    .refine((value) => isSettingKey(value), "Unknown setting"),
  /** Raw JSON string from the form; parsed and validated in the service. */
  value: z.string().min(1, "A value is required").max(4096),
});

export type UpdateSettingInput = z.infer<typeof updateSettingSchema>;

/** ADMIN force-stop of an operator's blast job. A reason is always required. */
export const adminStopJobSchema = z.object({
  blastJobId: cuidSchema,
  reason: z
    .string()
    .trim()
    .min(5, "Give a reason of at least 5 characters")
    .max(255),
});

export type AdminStopJobInput = z.infer<typeof adminStopJobSchema>;

export const auditLogQuerySchema = z.object({
  action: optionalTrimmedString(64),
  resourceType: optionalTrimmedString(48),
  actorUserId: cuidSchema.optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(20),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
