import "server-only";

import { z } from "zod";

import { cuidSchema, optionalTrimmedString } from "@/lib/validation/common";
import { ALLOWED_SPEED_SECONDS } from "@/lib/constants";

/**
 * Device and blast-job schemas for USER-facing mutations.
 *
 * These schemas deliberately accept only identifiers and a speed. Nothing that
 * could influence payout, content or targeting is accepted from the client.
 */

export const createDeviceSchema = z.object({
  label: z
    .string()
    .trim()
    .min(2, "Give the device a name of at least 2 characters")
    .max(48, "Name must be at most 48 characters"),
});

export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;

/** Pair-code numbers are validated then normalised server-side. */
export const pairDeviceSchema = z
  .object({
    deviceId: cuidSchema,
    method: z.enum(["QR", "PAIR_CODE"]),
    phoneNumber: optionalTrimmedString(24),
  })
  .refine(
    (data) => data.method !== "PAIR_CODE" || Boolean(data.phoneNumber),
    {
      path: ["phoneNumber"],
      message: "Enter the WhatsApp number for this device",
    },
  );

export type PairDeviceInput = z.infer<typeof pairDeviceSchema>;

export const deviceActionSchema = z.object({
  deviceId: cuidSchema,
  action: z.enum(["DISCONNECT", "RECONNECT", "REMOVE"]),
});

const speedSchema = z.union([
  z.literal(ALLOWED_SPEED_SECONDS[0]),
  z.literal(ALLOWED_SPEED_SECONDS[1]),
  z.literal(ALLOWED_SPEED_SECONDS[2]),
  z.literal(ALLOWED_SPEED_SECONDS[3]),
]);

export const startBlastSchema = z.object({
  campaignId: cuidSchema,
  deviceId: cuidSchema,
  speedSeconds: z.coerce.number().pipe(speedSchema),
  acceptedTerms: z.boolean().default(false),
});

export type StartBlastFormInput = z.infer<typeof startBlastSchema>;

export const blastJobActionSchema = z.object({
  blastJobId: cuidSchema,
  action: z.enum(["PAUSE", "RESUME", "STOP"]),
  reason: optionalTrimmedString(255),
});

export type BlastJobActionInput = z.infer<typeof blastJobActionSchema>;
