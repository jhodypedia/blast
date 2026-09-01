import "server-only";

import { z } from "zod";

import { cuidSchema, moneyStringSchema, optionalTrimmedString } from "@/lib/validation/common";

/**
 * Wallet and withdrawal schemas (RULES.md §15).
 *
 * The wallet may be set once; later edits go through a review request. Amounts
 * are validated as fixed-point strings and re-computed server-side — a
 * client-supplied fee or net amount is never trusted.
 */

/** Supported payout providers. Extend only alongside a verified integration. */
export const PAYOUT_PROVIDERS = [
  { code: "BCA", name: "BCA", kind: "BANK" },
  { code: "BNI", name: "BNI", kind: "BANK" },
  { code: "BRI", name: "BRI", kind: "BANK" },
  { code: "MANDIRI", name: "Mandiri", kind: "BANK" },
  { code: "PERMATA", name: "Permata", kind: "BANK" },
  { code: "CIMB", name: "CIMB Niaga", kind: "BANK" },
  { code: "GOPAY", name: "GoPay", kind: "EWALLET" },
  { code: "OVO", name: "OVO", kind: "EWALLET" },
  { code: "DANA", name: "DANA", kind: "EWALLET" },
  { code: "SHOPEEPAY", name: "ShopeePay", kind: "EWALLET" },
  { code: "LINKAJA", name: "LinkAja", kind: "EWALLET" },
] as const;

export type PayoutProviderCode = (typeof PAYOUT_PROVIDERS)[number]["code"];

const providerCodeSchema = z.enum(
  PAYOUT_PROVIDERS.map((provider) => provider.code) as [
    PayoutProviderCode,
    ...PayoutProviderCode[],
  ],
);

export function providerName(code: PayoutProviderCode): string {
  const provider = PAYOUT_PROVIDERS.find((entry) => entry.code === code);
  return provider?.name ?? code;
}

export const setWalletSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(3, "Enter the full name on the account")
    .max(80, "Name must be at most 80 characters")
    .regex(
      /^[\p{L}\p{M}][\p{L}\p{M}\s'.-]*$/u,
      "Name may only contain letters, spaces, apostrophes, periods and hyphens",
    ),
  providerCode: providerCodeSchema,
  accountNumber: z
    .string()
    .trim()
    .min(6, "Account number must be at least 6 digits")
    .max(24, "Account number must be at most 24 digits")
    .regex(/^\d+$/, "Account number may contain digits only"),
  confirmAccountNumber: z.string().trim(),
  turnstileToken: z.string().trim().min(1, "Please complete the verification"),
}).refine((data) => data.accountNumber === data.confirmAccountNumber, {
  path: ["confirmAccountNumber"],
  message: "Account numbers do not match",
});

export type SetWalletInput = z.infer<typeof setWalletSchema>;

export const requestWithdrawalSchema = z.object({
  /** Gross amount requested; fee and net are computed server-side. */
  amount: moneyStringSchema,
  /** Re-authentication for a money-moving action. */
  password: z.string().min(1, "Enter your password to confirm").max(128),
  turnstileToken: z.string().trim().min(1, "Please complete the verification"),
  confirm: z.literal(true, {
    message: "You must confirm the withdrawal request",
  }),
});

export type RequestWithdrawalInput = z.infer<typeof requestWithdrawalSchema>;

/** ADMIN-only withdrawal decisions. */
export const reviewWithdrawalSchema = z
  .object({
    withdrawalId: cuidSchema,
    action: z.enum(["APPROVE", "REJECT", "PROCESS", "MARK_PAID", "CANCEL"]),
    note: optionalTrimmedString(255),
    /** Required when rejecting so the user receives a reason. */
    rejectionReason: optionalTrimmedString(255),
    payoutReference: optionalTrimmedString(191),
  })
  .refine(
    (data) => data.action !== "REJECT" || Boolean(data.rejectionReason),
    {
      path: ["rejectionReason"],
      message: "Provide a reason for the rejection",
    },
  )
  .refine(
    (data) => data.action !== "MARK_PAID" || Boolean(data.payoutReference),
    {
      path: ["payoutReference"],
      message: "Provide the payout reference",
    },
  );

export type ReviewWithdrawalInput = z.infer<typeof reviewWithdrawalSchema>;

/** ADMIN-only manual balance adjustment. Always requires a reason. */
export const adjustBalanceSchema = z.object({
  userId: cuidSchema,
  direction: z.enum(["CREDIT", "DEBIT"]),
  amount: moneyStringSchema,
  reason: z
    .string()
    .trim()
    .min(10, "Give a clear reason of at least 10 characters")
    .max(255),
});

export type AdjustBalanceInput = z.infer<typeof adjustBalanceSchema>;
