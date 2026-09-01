import { describe, expect, it } from "vitest";

import {
  PAYOUT_PROVIDERS,
  providerName,
  requestWithdrawalSchema,
  reviewWithdrawalSchema,
  setWalletSchema,
} from "@/lib/validation/wallet";

/**
 * Wallet and withdrawal validation (RULES.md §15). Money-moving forms must
 * re-authenticate, confirm, and pass Turnstile; the account number is never
 * accepted without a matching confirmation field.
 */

const wallet = {
  fullName: "Budi Santoso",
  providerCode: "BCA" as const,
  accountNumber: "1234567890",
  confirmAccountNumber: "1234567890",
  turnstileToken: "token",
};

describe("setWalletSchema", () => {
  it("accepts a matching account number pair", () => {
    expect(setWalletSchema.safeParse(wallet).success).toBe(true);
  });

  it("rejects a mismatched confirmation", () => {
    const result = setWalletSchema.safeParse({
      ...wallet,
      confirmAccountNumber: "1234567899",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.path.includes("confirmAccountNumber"),
        ),
      ).toBe(true);
    }
  });

  it("rejects a non-numeric account number", () => {
    const result = setWalletSchema.safeParse({
      ...wallet,
      accountNumber: "12345abc",
      confirmAccountNumber: "12345abc",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an unknown provider", () => {
    const result = setWalletSchema.safeParse({
      ...wallet,
      providerCode: "NOTABANK",
    });

    expect(result.success).toBe(false);
  });

  it("requires a Turnstile token", () => {
    const result = setWalletSchema.safeParse({
      ...wallet,
      turnstileToken: "",
    });

    expect(result.success).toBe(false);
  });
});

describe("providerName", () => {
  it("resolves every configured provider code", () => {
    for (const provider of PAYOUT_PROVIDERS) {
      expect(providerName(provider.code)).toBe(provider.name);
    }
  });
});

describe("requestWithdrawalSchema", () => {
  const request = {
    amount: "50000",
    password: "correct horse battery",
    turnstileToken: "token",
    confirm: true,
  };

  it("accepts a confirmed request", () => {
    expect(requestWithdrawalSchema.safeParse(request).success).toBe(true);
  });

  it("rejects an unconfirmed request", () => {
    const result = requestWithdrawalSchema.safeParse({
      ...request,
      confirm: false,
    });

    expect(result.success).toBe(false);
  });

  it("rejects a missing password", () => {
    const result = requestWithdrawalSchema.safeParse({
      ...request,
      password: "",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an amount with excess precision", () => {
    const result = requestWithdrawalSchema.safeParse({
      ...request,
      amount: "1.00001",
    });

    expect(result.success).toBe(false);
  });
});

describe("reviewWithdrawalSchema", () => {
  it("requires a reason when rejecting", () => {
    const result = reviewWithdrawalSchema.safeParse({
      withdrawalId: "clh1withdrawal0001",
      action: "REJECT",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.path.includes("rejectionReason"),
        ),
      ).toBe(true);
    }
  });

  it("requires a payout reference when marking as paid", () => {
    const result = reviewWithdrawalSchema.safeParse({
      withdrawalId: "clh1withdrawal0001",
      action: "MARK_PAID",
    });

    expect(result.success).toBe(false);
  });

  it("accepts an approval without extra fields", () => {
    const result = reviewWithdrawalSchema.safeParse({
      withdrawalId: "clh1withdrawal0001",
      action: "APPROVE",
    });

    expect(result.success).toBe(true);
  });
});
