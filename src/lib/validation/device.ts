import "server-only";

import { z } from "zod";

import { cuidSchema, optionalTrimmedString } from "@/lib/validation/common";
import {
  ALLOWED_SPEED_SECONDS,
  USER_DELIVERY_LOG_STATUSES,
} from "@/lib/constants";

/**
 * Device and blast-job schemas for USER-facing mutations.
 *
 * These schemas deliberately accept only identifiers and a speed. Nothing that
 * could influence payout, content or targeting is accepted from the client.
 */

export const createDeviceSchema = z.object({});

export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;

/** Pair-code numbers are validated then normalised server-side. */
export const pairDeviceSchema = z
  .object({
    deviceId: cuidSchema,
    method: z.enum(["QR", "PAIR_CODE"]),
    phoneNumber: optionalTrimmedString(24),
    countryCode: z.string().trim().regex(/^[A-Z]{2}$/).optional(),
    customCode: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().trim().regex(/^[A-Za-z0-9]{8}$/).optional(),
    ),
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

/** Bulk start: the device set comes from the server, never the client. */
export const startBlastAllSchema = z.object({
  campaignId: cuidSchema,
  speedSeconds: z.coerce.number().pipe(speedSchema),
  acceptedTerms: z.boolean().default(false),
});

export type StartBlastAllInput = z.infer<typeof startBlastAllSchema>;

export const deliveryLogFilterSchema = z.object({
  status: z.enum(USER_DELIVERY_LOG_STATUSES).optional(),
  deviceId: cuidSchema.optional(),
});

export type DeliveryLogFilterInput = z.infer<typeof deliveryLogFilterSchema>;

export const blastJobActionSchema = z.object({
  blastJobId: cuidSchema,
  action: z.enum(["PAUSE", "RESUME", "STOP"]),
  reason: optionalTrimmedString(255),
});

export type BlastJobActionInput = z.infer<typeof blastJobActionSchema>;
