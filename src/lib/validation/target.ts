import "server-only";

import { z } from "zod";

import { cuidSchema, countryCodeSchema, optionalTrimmedString } from "@/lib/validation/common";

/**
 * Target-list schemas — ADMIN only (RULES.md §10).
 *
 * The file itself is validated by the storage layer (extension, size) and by the
 * streaming parser (content). These schemas cover only the surrounding metadata.
 */

export const createTargetListSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Name must be at least 3 characters")
    .max(120, "Name must be at most 120 characters"),
  /** Falls back to the admin setting when omitted. */
  defaultCountryCode: countryCodeSchema.optional(),
});

export type CreateTargetListInput = z.infer<typeof createTargetListSchema>;

export const archiveTargetListSchema = z.object({
  targetListId: cuidSchema,
  reason: optionalTrimmedString(255),
});

export type ArchiveTargetListInput = z.infer<typeof archiveTargetListSchema>;
