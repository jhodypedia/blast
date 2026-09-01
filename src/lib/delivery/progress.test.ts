import { describe, expect, it } from "vitest";

import {
  completionPercent,
  deriveTerminalStatus,
  type ProgressCounts,
} from "@/lib/delivery/progress";

/**
 * Progress derivation (RULES.md §11, §12).
 *
 * A job must not be finalised while any recipient is still pending or in flight,
 * and an ambiguous recipient must never be reported as a clean completion.
 */

function counts(overrides: Partial<ProgressCounts> = {}): ProgressCounts {
  return {
    total: 0,
    pending: 0,
    inFlight: 0,
    sent: 0,
    failed: 0,
    cancelled: 0,
    skipped: 0,
    needsReconciliation: 0,
    ...overrides,
  };
}

describe("completionPercent", () => {
  it("returns 0 for an empty job rather than dividing by zero", () => {
    expect(completionPercent(counts())).toBe(0);
  });

  it("counts every resolved state towards completion", () => {
    expect(
      completionPercent(
        counts({
          total: 10,
          sent: 4,
          failed: 2,
          cancelled: 1,
          skipped: 1,
          needsReconciliation: 2,
        }),
      ),
    ).toBe(100);
  });

  it("excludes pending and in-flight recipients", () => {
    expect(
      completionPercent(counts({ total: 10, sent: 5, pending: 3, inFlight: 2 })),
    ).toBe(50);
  });

  it("never exceeds 100", () => {
    expect(completionPercent(counts({ total: 2, sent: 5 }))).toBe(100);
  });
});

describe("deriveTerminalStatus", () => {
  it("treats a job with no recipients as complete", () => {
    expect(deriveTerminalStatus(counts())).toBe("COMPLETED");
  });

  it("returns null while recipients are pending", () => {
    expect(deriveTerminalStatus(counts({ total: 5, sent: 4, pending: 1 }))).toBe(
      null,
    );
  });

  it("returns null while recipients are in flight", () => {
    expect(
      deriveTerminalStatus(counts({ total: 5, sent: 4, inFlight: 1 })),
    ).toBe(null);
  });

  it("reports PARTIAL_FAILED when any recipient failed", () => {
    expect(deriveTerminalStatus(counts({ total: 5, sent: 4, failed: 1 }))).toBe(
      "PARTIAL_FAILED",
    );
  });

  it("reports PARTIAL_FAILED when reconciliation is outstanding", () => {
    expect(
      deriveTerminalStatus(counts({ total: 5, sent: 4, needsReconciliation: 1 })),
    ).toBe("PARTIAL_FAILED");
  });

  it("reports COMPLETED when every recipient resolved cleanly", () => {
    expect(
      deriveTerminalStatus(
        counts({ total: 5, sent: 3, cancelled: 1, skipped: 1 }),
      ),
    ).toBe("COMPLETED");
  });
});
