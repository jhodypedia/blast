import { Decimal } from "decimal.js";

/**
 * Money helpers.
 *
 * Every monetary value in this application is a fixed-point decimal. JavaScript
 * floats are never used for payout, balance, fee or withdrawal maths
 * (RULES.md §14). Values cross service boundaries as strings and are stored as
 * MySQL `DECIMAL(18,4)`.
 */

export const MONEY_SCALE = 4;

// Configure once: 4 decimal places, banker-free half-up rounding.
Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_UP });

export type MoneyInput = string | number | Decimal;

/** Parses a value into a Decimal, rejecting NaN/Infinity and bad strings. */
export function money(value: MoneyInput): Decimal {
  const decimal =
    value instanceof Decimal ? value : new Decimal(typeof value === "number" ? value.toString() : value);

  if (!decimal.isFinite()) {
    throw new Error("Monetary value must be finite");
  }
  return decimal;
}

/** Normalises to the storage scale, e.g. `"1234.5000"`. */
export function toMoneyString(value: MoneyInput): string {
  return money(value).toFixed(MONEY_SCALE, Decimal.ROUND_HALF_UP);
}

export function addMoney(...values: MoneyInput[]): Decimal {
  return values.reduce<Decimal>((total, value) => total.plus(money(value)), new Decimal(0));
}

export function subtractMoney(minuend: MoneyInput, subtrahend: MoneyInput): Decimal {
  return money(minuend).minus(money(subtrahend));
}

export function multiplyMoney(value: MoneyInput, factor: MoneyInput): Decimal {
  return money(value).times(money(factor));
}

export function isNegative(value: MoneyInput): boolean {
  return money(value).isNegative();
}

export function isZero(value: MoneyInput): boolean {
  return money(value).isZero();
}

export function isPositive(value: MoneyInput): boolean {
  return money(value).greaterThan(0);
}

export function compareMoney(a: MoneyInput, b: MoneyInput): -1 | 0 | 1 {
  return money(a).comparedTo(money(b)) as -1 | 0 | 1;
}

export function isGreaterOrEqual(a: MoneyInput, b: MoneyInput): boolean {
  return money(a).greaterThanOrEqualTo(money(b));
}

/**
 * Formats for presentation. Currency values are rendered with 0 fraction
 * digits for IDR and 2 otherwise, matching typical expectations.
 */
export function formatMoney(
  value: MoneyInput,
  currency: string,
  locale = "id-ID",
): string {
  const fractionDigits = currency.toUpperCase() === "IDR" ? 0 : 2;
  const numeric = Number(money(value).toFixed(MONEY_SCALE));

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(numeric);
}

export { Decimal };
