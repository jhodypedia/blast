import parsePhoneNumberFromString, {
  type CountryCode,
} from "libphonenumber-js";

/**
 * Phone number normalisation (RULES.md §11).
 *
 * Rules enforced here:
 * - Output is canonical international format, digits only, no `+`.
 * - Numbers already carrying an international prefix (`+` or `00`) keep their
 *   own country code.
 * - Only genuinely local numbers (no prefix) receive the configured default
 *   country code. Nothing is blindly prefixed with `62`.
 */

export type NormalizationFailureReason =
  | "EMPTY"
  | "TOO_SHORT"
  | "TOO_LONG"
  | "NON_NUMERIC"
  | "INVALID_NUMBER"
  | "UNKNOWN_COUNTRY";

export type NormalizationResult =
  | {
      ok: true;
      /** E.164 without the leading `+`, e.g. `6281234567890`. */
      normalizedNumber: string;
      /** Numeric country calling code, e.g. `62`. */
      countryCode: string;
    }
  | { ok: false; reason: NormalizationFailureReason };

const MIN_DIGITS = 7;
const MAX_DIGITS = 15;

/** Strips formatting characters while remembering an international prefix. */
function sanitize(raw: string): {
  digits: string;
  hasInternationalPrefix: boolean;
} {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  const digitsOnly = trimmed.replace(/\D+/g, "");

  if (hasPlus) {
    return { digits: digitsOnly, hasInternationalPrefix: true };
  }

  // `00` is the ITU international access prefix.
  if (digitsOnly.startsWith("00")) {
    return {
      digits: digitsOnly.slice(2),
      hasInternationalPrefix: true,
    };
  }

  return { digits: digitsOnly, hasInternationalPrefix: false };
}

/**
 * Normalises a single raw phone number.
 *
 * @param raw Raw value from a target file row.
 * @param defaultCountry ISO-3166-1 alpha-2 code from admin settings, applied
 *   only when the value has no international prefix.
 */
export function normalizePhoneNumber(
  raw: string,
  defaultCountry: string,
): NormalizationResult {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, reason: "EMPTY" };
  }

  // Reject values containing letters; they are data errors, not formatting.
  if (/[A-Za-z]/.test(raw)) {
    return { ok: false, reason: "NON_NUMERIC" };
  }

  const { digits, hasInternationalPrefix } = sanitize(raw);

  if (digits.length === 0) {
    return { ok: false, reason: "NON_NUMERIC" };
  }
  if (digits.length < MIN_DIGITS) {
    return { ok: false, reason: "TOO_SHORT" };
  }
  if (digits.length > MAX_DIGITS + 2) {
    return { ok: false, reason: "TOO_LONG" };
  }

  const country = defaultCountry.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) {
    return { ok: false, reason: "UNKNOWN_COUNTRY" };
  }

  const parsed = hasInternationalPrefix
    ? parsePhoneNumberFromString(`+${digits}`)
    : parsePhoneNumberFromString(digits, country as CountryCode);

  if (!parsed || !parsed.isValid()) {
    return { ok: false, reason: "INVALID_NUMBER" };
  }

  const e164 = parsed.format("E.164").replace(/^\+/, "");
  if (e164.length < MIN_DIGITS) {
    return { ok: false, reason: "TOO_SHORT" };
  }
  if (e164.length > MAX_DIGITS) {
    return { ok: false, reason: "TOO_LONG" };
  }

  return {
    ok: true,
    normalizedNumber: e164,
    countryCode: parsed.countryCallingCode.toString(),
  };
}

/**
 * Masks a number for display. Only ADMIN screens that are explicitly
 * authorised may show unmasked values; everything else uses this.
 */
export function maskPhoneNumber(normalizedNumber: string): string {
  if (normalizedNumber.length <= 4) {
    return "•".repeat(normalizedNumber.length);
  }
  const head = normalizedNumber.slice(0, 2);
  const tail = normalizedNumber.slice(-2);
  return `${head}${"•".repeat(Math.max(normalizedNumber.length - 4, 1))}${tail}`;
}

/** Masks a bank/e-wallet account number down to its last four digits. */
export function maskAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/\s+/g, "");
  if (digits.length <= 4) {
    return "•".repeat(digits.length);
  }
  return `${"•".repeat(digits.length - 4)}${digits.slice(-4)}`;
}
