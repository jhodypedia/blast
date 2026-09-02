import { describe, expect, it } from "vitest";

import {
  blastJobActionSchema,
  createDeviceSchema,
  pairDeviceSchema,
  startBlastSchema,
} from "@/lib/validation/device";

/**
 * Device and blast-job validation (RULES.md §11, §12).
 *
 * The client may only ever supply identifiers and a speed. Anything that could
 * influence payout, content or targeting must be rejected at this boundary.
 */

describe("startBlastSchema", () => {
  const input = {
    campaignId: "clh1campaign0001",
    deviceId: "clh1device0001",
    speedSeconds: 3,
    acceptedTerms: true,
  };

  it("accepts each allowed speed", () => {
    for (const speedSeconds of [1, 3, 6, 10]) {
      expect(
        startBlastSchema.safeParse({ ...input, speedSeconds }).success,
      ).toBe(true);
    }
  });

  it("coerces a numeric string speed from a form post", () => {
    const result = startBlastSchema.safeParse({ ...input, speedSeconds: "6" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.speedSeconds).toBe(6);
    }
  });

  it("rejects a speed outside the allowed set", () => {
    for (const speedSeconds of [0, 2, 5, 11, -1]) {
      expect(
        startBlastSchema.safeParse({ ...input, speedSeconds }).success,
      ).toBe(false);
    }
  });

  it("ignores extra client-supplied fields such as payout", () => {
    const result = startBlastSchema.safeParse({
      ...input,
      payoutPerSend: "999999",
      quotaPerUser: 999_999,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("payoutPerSend");
      expect(result.data).not.toHaveProperty("quotaPerUser");
    }
  });

  it("defaults acceptedTerms to false when absent", () => {
    const result = startBlastSchema.safeParse({
      campaignId: input.campaignId,
      deviceId: input.deviceId,
      speedSeconds: 1,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.acceptedTerms).toBe(false);
    }
  });
});

describe("blastJobActionSchema", () => {
  it("accepts the three operator controls", () => {
    for (const action of ["PAUSE", "RESUME", "STOP"]) {
      expect(
        blastJobActionSchema.safeParse({
          blastJobId: "clh1job0001",
          action,
        }).success,
      ).toBe(true);
    }
  });

  it("rejects an unknown control", () => {
    expect(
      blastJobActionSchema.safeParse({
        blastJobId: "clh1job0001",
        action: "DELETE",
      }).success,
    ).toBe(false);
  });
});

describe("device schemas", () => {
  it("requires a phone number for pair-code pairing", () => {
    const result = pairDeviceSchema.safeParse({
      deviceId: "clh1device0001",
      method: "PAIR_CODE",
    });

    expect(result.success).toBe(false);
  });

  it("does not require a phone number for QR pairing", () => {
    const result = pairDeviceSchema.safeParse({
      deviceId: "clh1device0001",
      method: "QR",
    });

    expect(result.success).toBe(true);
  });

  it("does not accept a device label from the client", () => {
    const result = createDeviceSchema.safeParse({ label: "Nama manual" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty("label");
  });

  it("accepts only an eight-character custom pairing code", () => {
    expect(
      pairDeviceSchema.safeParse({
        deviceId: "clh1device0001",
        method: "PAIR_CODE",
        phoneNumber: "+6281234567890",
        customCode: "ELAINA01",
      }).success,
    ).toBe(true);
    expect(
      pairDeviceSchema.safeParse({
        deviceId: "clh1device0001",
        method: "PAIR_CODE",
        phoneNumber: "+6281234567890",
        customCode: "short",
      }).success,
    ).toBe(false);
  });
});
