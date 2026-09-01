import { describe, expect, it } from "vitest";

import {
  decryptFromString,
  decryptJson,
  encryptJson,
  encryptToString,
  hashForLogging,
  recipientReference,
  safeEqual,
} from "@/lib/security/crypto";

/** At-rest encryption for device credentials and wallet data (RULES.md §7). */
describe("encryptToString / decryptFromString", () => {
  it("round-trips a value", () => {
    const plaintext = "sensitive-session-material";
    expect(decryptFromString(encryptToString(plaintext))).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptToString("same-input");
    const b = encryptToString("same-input");
    expect(a).not.toBe(b);
    expect(decryptFromString(a)).toBe(decryptFromString(b));
  });

  it("never contains the plaintext", () => {
    const ciphertext = encryptToString("6281234567890");
    expect(ciphertext).not.toContain("6281234567890");
  });

  it("uses a versioned, dot-delimited envelope", () => {
    const parts = encryptToString("x").split(".");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("v1");
  });

  it("rejects a tampered ciphertext", () => {
    const parts = encryptToString("payload").split(".");
    // Flip a character in the ciphertext segment.
    const data = parts[3] ?? "";
    parts[3] = data.startsWith("A") ? `B${data.slice(1)}` : `A${data.slice(1)}`;
    expect(() => decryptFromString(parts.join("."))).toThrow();
  });

  it("rejects a malformed envelope", () => {
    expect(() => decryptFromString("not-a-payload")).toThrow(
      /Malformed ciphertext/,
    );
    expect(() => decryptFromString("v1.a.b")).toThrow(/Malformed ciphertext/);
  });

  it("round-trips JSON values", () => {
    const value = { registrationId: 7, keys: ["a", "b"], nested: { ok: true } };
    expect(decryptJson<typeof value>(encryptJson(value))).toEqual(value);
  });
});

describe("hashForLogging", () => {
  it("is deterministic and non-reversible", () => {
    const hash = hashForLogging("203.0.113.7");
    expect(hash).toBe(hashForLogging("203.0.113.7"));
    expect(hash).not.toContain("203.0.113.7");
    expect(hash).toHaveLength(32);
  });

  it("separates different inputs", () => {
    expect(hashForLogging("a")).not.toBe(hashForLogging("b"));
  });
});

describe("recipientReference", () => {
  it("is stable per campaign and number", () => {
    const ref = recipientReference("camp_1", "6281234567890");
    expect(ref).toBe(recipientReference("camp_1", "6281234567890"));
  });

  it("differs across campaigns so references cannot be correlated", () => {
    expect(recipientReference("camp_1", "6281234567890")).not.toBe(
      recipientReference("camp_2", "6281234567890"),
    );
  });

  it("never leaks the raw number", () => {
    expect(recipientReference("camp_1", "6281234567890")).not.toContain(
      "6281234567890",
    );
  });
});

describe("safeEqual", () => {
  it("matches identical strings", () => {
    expect(safeEqual("token-value", "token-value")).toBe(true);
  });

  it("rejects different strings and lengths", () => {
    expect(safeEqual("token-value", "token-valuf")).toBe(false);
    expect(safeEqual("short", "longer-value")).toBe(false);
  });
});
