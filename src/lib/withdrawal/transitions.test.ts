import { describe, expect, it } from "vitest";

import {
  NEXT_STATUS,
  canReview,
  isTerminal,
  releasesFunds,
  type ReviewAction,
  type WithdrawalStatus,
} from "@/lib/withdrawal/transitions";

/**
 * Withdrawal state machine (RULES.md §15).
 *
 * The critical invariants: a paid withdrawal can never be changed, a cancellation
 * is only possible while still pending, and exactly the two refund paths release
 * the held balance.
 */

const ALL_STATUSES: WithdrawalStatus[] = [
  "PENDING",
  "PROCESSING",
  "APPROVED",
  "PAID",
  "REJECTED",
  "CANCELLED",
];

const ALL_ACTIONS: ReviewAction[] = [
  "APPROVE",
  "PROCESS",
  "MARK_PAID",
  "REJECT",
  "CANCEL",
];

describe("withdrawal transitions", () => {
  it("never allows a decision on a terminal withdrawal", () => {
    for (const status of ALL_STATUSES.filter(isTerminal)) {
      for (const action of ALL_ACTIONS) {
        expect(canReview(action, status)).toBe(false);
      }
    }
  });

  it("only allows cancellation while pending", () => {
    expect(canReview("CANCEL", "PENDING")).toBe(true);

    for (const status of ALL_STATUSES.filter((s) => s !== "PENDING")) {
      expect(canReview("CANCEL", status)).toBe(false);
    }
  });

  it("only marks paid from approved or processing", () => {
    expect(canReview("MARK_PAID", "APPROVED")).toBe(true);
    expect(canReview("MARK_PAID", "PROCESSING")).toBe(true);
    expect(canReview("MARK_PAID", "PENDING")).toBe(false);
  });

  it("allows rejection from every open state", () => {
    for (const status of ["PENDING", "PROCESSING", "APPROVED"] as const) {
      expect(canReview("REJECT", status)).toBe(true);
    }
  });

  it("releases funds only on reject and cancel", () => {
    expect(releasesFunds("REJECT")).toBe(true);
    expect(releasesFunds("CANCEL")).toBe(true);
    expect(releasesFunds("APPROVE")).toBe(false);
    expect(releasesFunds("PROCESS")).toBe(false);
    expect(releasesFunds("MARK_PAID")).toBe(false);
  });

  it("maps every action to a distinct next status", () => {
    const targets = ALL_ACTIONS.map((action) => NEXT_STATUS[action]);
    expect(new Set(targets).size).toBe(ALL_ACTIONS.length);
  });

  it("moves each open state towards a defined status", () => {
    for (const action of ALL_ACTIONS) {
      expect(ALL_STATUSES).toContain(NEXT_STATUS[action]);
    }
  });

  it("treats paid, rejected and cancelled as terminal", () => {
    expect(isTerminal("PAID")).toBe(true);
    expect(isTerminal("REJECTED")).toBe(true);
    expect(isTerminal("CANCELLED")).toBe(true);
    expect(isTerminal("PENDING")).toBe(false);
    expect(isTerminal("PROCESSING")).toBe(false);
    expect(isTerminal("APPROVED")).toBe(false);
  });
});
