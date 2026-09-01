import { z } from "zod";

/**
 * Shared primitive schemas. Every server entry point validates input with Zod
 * (RULES.md §9); these building blocks keep the rules identical on the client
 * (React Hook Form resolver) and the server.
 */

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .max(254, "Email is too long")
  .email("Enter a valid email address")
  .transform((value) => value.toLowerCase());

/**
 * Password policy: 10+ characters with upper case, lower case and a digit.
 * Deliberately favours length over exotic symbol requirements.
 */
export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/\d/, "Password must include a number");

export const nameSchema = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(80, "Name must be at most 80 characters")
  .regex(
    /^[\p{L}\p{M}][\p{L}\p{M}\s'.-]*$/u,
    "Name may only contain letters, spaces, apostrophes, periods and hyphens",
  );

export const cuidSchema = z.string().trim().min(1).max(64).regex(/^[a-z0-9]+$/i, "Invalid identifier");

export const turnstileTokenSchema = z
  .string()
  .trim()
  .min(1, "Please complete the verification challenge")
  .max(2048);

/** ISO-3166-1 alpha-2 country code, used as the default for local numbers. */
export const countryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(2, "Country code must be two letters")
  .regex(/^[A-Z]{2}$/, "Country code must be two letters");

/** Monetary amount as a string, validated to the storage scale. */
export const moneyStringSchema = z
  .string()
  .trim()
  .regex(/^\d{1,14}(\.\d{1,4})?$/, "Enter a valid amount with up to 4 decimal places");

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;

/** Trims a string and converts empty results to `undefined`. */
export const optionalTrimmedString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined));
