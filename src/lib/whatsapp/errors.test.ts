import { describe, expect, it } from "vitest";

import { classifySendError, retryBackoffMs } from "@/lib/whatsapp/errors";

/**
 * Failure classification (RULES.md §12).
 *
 * The rule that matters most: once a write has been attempted, an inconclusive
 * error must become UNKNOWN, never RETRYABLE_FAILED.
 */
describe("classifySendError", () => {
  it("treats a pre-write connection reset as retryable", () => {
    const error = Object.assign(new Error("socket hang up"), {
      code: "ECONNRESET",
    });
    expect(classifySendError(error, false).status).toBe("RETRYABLE_FAILED");
  });

  it("treats a post-write connection reset as ambiguous", () => {
    const error = Object.assign(new Error("socket hang up"), {
      code: "ECONNRESET",
    });
    const result = classifySendError(error, true);
    expect(result.status).toBe("UNKNOWN");
    expect(result.category).toBe("AMBIGUOUS_AFTER_WRITE");
  });

  it("treats a pre-write timeout as retryable", () => {
    expect(classifySendError(new Error("Request timed out"), false).status).toBe(
      "RETRYABLE_FAILED",
    );
  });

  it("treats a post-write timeout as ambiguous", () => {
    const result = classifySendError(new Error("Request timed out"), true);
    expect(result.status).toBe("UNKNOWN");
    expect(result.category).toBe("AMBIGUOUS_TIMEOUT");
  });

  it("marks a permanent provider status as failed even after a write", () => {
    const error = Object.assign(new Error("forbidden"), {
      output: { statusCode: 403 },
    });
    const result = classifySendError(error, true);
    expect(result.status).toBe("FAILED");
    expect(result.category).toBe("PROVIDER_403");
  });

  it("marks a 429 before a write as retryable", () => {
    const error = Object.assign(new Error("rate limited"), {
      output: { statusCode: 429 },
    });
    expect(classifySendError(error, false).status).toBe("RETRYABLE_FAILED");
  });

  it("marks an unregistered recipient as permanently failed", () => {
    const result = classifySendError(
      new Error("recipient is not on WhatsApp"),
      false,
    );
    expect(result.status).toBe("FAILED");
    expect(result.category).toBe("RECIPIENT_NOT_ON_WHATSAPP");
  });

  it("never returns a retryable status for an unclassified post-write error", () => {
    const result = classifySendError(new Error("something odd"), true);
    expect(result.status).toBe("UNKNOWN");
  });

  it("fails an unclassified pre-write error rather than retrying blindly", () => {
    const result = classifySendError(new Error("something odd"), false);
    expect(result.status).toBe("FAILED");
    expect(result.category).toBe("UNCLASSIFIED");
  });

  it("does not leak a stack trace into the reason", () => {
    const error = new Error("boom");
    const result = classifySendError(error, false);
    expect(result.reason).toBe("boom");
    expect(result.reason).not.toContain("at ");
  });
});

describe("retryBackoffMs", () => {
  it("grows with the attempt number", () => {
    expect(retryBackoffMs(2)).toBeGreaterThan(retryBackoffMs(1) - 5_000);
    expect(retryBackoffMs(3)).toBeGreaterThan(retryBackoffMs(1));
  });

  it("is capped", () => {
    expect(retryBackoffMs(50)).toBeLessThanOrEqual(305_000);
  });
});
