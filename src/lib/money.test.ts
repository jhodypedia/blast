import { describe, expect, it } from "vitest";

import {
  addMoney,
  compareMoney,
  formatMoney,
  isGreaterOrEqual,
  money,
  multiplyMoney,
  subtractMoney,
  toMoneyString,
} from "@/lib/money";

/**
 * Money maths (RULES.md §14): no float arithmetic anywhere in the ledger path.
 */
describe("money", () => {
  it("normalises to the storage scale", () => {
    expect(toMoneyString("25")).toBe("25.0000");
    expect(toMoneyString(1234.5)).toBe("1234.5000");
  });

  it("adds without float drift", () => {
    // 0.1 + 0.2 !== 0.3 in IEEE-754 floats.
    expect(toMoneyString(addMoney("0.1", "0.2"))).toBe("0.3000");
  });

  it("multiplies a payout rate by a send count exactly", () => {
    expect(toMoneyString(multiplyMoney("0.0001", 10_000))).toBe("1.0000");
  });

  it("subtracts to an exact result", () => {
    expect(toMoneyString(subtractMoney("100000", "37500.25"))).toBe(
      "62499.7500",
    );
  });

  it("rounds half up at the storage scale", () => {
    expect(toMoneyString("0.00005")).toBe("0.0001");
  });

  it("rejects non-finite values", () => {
    expect(() => money(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => money("abc")).toThrow();
  });

  it("compares amounts as decimals, not strings", () => {
    // Lexicographic comparison would order "9" after "10".
    expect(compareMoney("9", "10")).toBe(-1);
    expect(isGreaterOrEqual("50000", "50000")).toBe(true);
    expect(isGreaterOrEqual("49999.9999", "50000")).toBe(false);
  });

  it("formats IDR without fraction digits", () => {
    const formatted = formatMoney("50000", "IDR");
    expect(formatted).toContain("50");
    expect(formatted).not.toContain(",00");
  });
});
