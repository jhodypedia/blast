import { describe, expect, it } from "vitest";

import {
  maskAccountNumber,
  maskPhoneNumber,
  normalizePhoneNumber,
} from "@/lib/phone/normalize";

/**
 * Phone normalisation rules (RULES.md §10).
 * The critical rule under test: only prefix-less local numbers receive the
 * default country code.
 */
describe("normalizePhoneNumber", () => {
  it("keeps an explicit + prefix country code", () => {
    const result = normalizePhoneNumber("+6281234567890", "US");
    expect(result).toEqual({
      ok: true,
      normalizedNumber: "6281234567890",
      countryCode: "62",
    });
  });

  it("treats a 00 prefix as international", () => {
    const result = normalizePhoneNumber("006281234567890", "US");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalizedNumber).toBe("6281234567890");
      expect(result.countryCode).toBe("62");
    }
  });

  it("applies the default country only to a local number", () => {
    const result = normalizePhoneNumber("081234567890", "ID");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalizedNumber).toBe("6281234567890");
    }
  });

  it("does not force country code 62 onto a foreign international number", () => {
    const result = normalizePhoneNumber("+14155552671", "ID");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalizedNumber).toBe("14155552671");
      expect(result.countryCode).toBe("1");
    }
  });

  it("strips formatting characters", () => {
    const result = normalizePhoneNumber(" (0812) 3456-7890 ", "ID");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalizedNumber).toBe("6281234567890");
    }
  });

  it("rejects an empty value", () => {
    expect(normalizePhoneNumber("   ", "ID")).toEqual({
      ok: false,
      reason: "EMPTY",
    });
  });

  it("rejects values containing letters", () => {
    expect(normalizePhoneNumber("0812ABC5678", "ID")).toEqual({
      ok: false,
      reason: "NON_NUMERIC",
    });
  });

  it("rejects a number that is too short", () => {
    expect(normalizePhoneNumber("12345", "ID")).toEqual({
      ok: false,
      reason: "TOO_SHORT",
    });
  });

  it("rejects a number whose country calling code does not exist", () => {
    // 999 is not an assigned ITU country calling code.
    const result = normalizePhoneNumber("+9991234567890", "ID");
    expect(result).toEqual({ ok: false, reason: "INVALID_NUMBER" });
  });

  it("rejects an invalid default country code", () => {
    expect(normalizePhoneNumber("081234567890", "IDN")).toEqual({
      ok: false,
      reason: "UNKNOWN_COUNTRY",
    });
  });
});

describe("maskPhoneNumber", () => {
  it("keeps only the first and last two digits", () => {
    const masked = maskPhoneNumber("6281234567890");
    expect(masked.startsWith("62")).toBe(true);
    expect(masked.endsWith("90")).toBe(true);
    expect(masked).not.toContain("812345678");
  });

  it("fully masks a very short value", () => {
    expect(maskPhoneNumber("1234")).toBe("••••");
  });
});

describe("maskAccountNumber", () => {
  it("reveals only the last four digits", () => {
    expect(maskAccountNumber("1234567890")).toBe("••••••7890");
  });
});
