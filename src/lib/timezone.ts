/**
 * Process timezone bootstrap.
 *
 * Import this module FIRST in every long-running server entry point
 * (`server.ts`, `src/worker/main.ts`) so `process.env.TZ` is set before any
 * `Date` operation runs. V8/libc cache the timezone on first use, so a late
 * assignment would silently keep the previous zone.
 *
 * Resolution order:
 *   1. OS/container `TZ` environment variable (explicit override).
 *   2. `TZ` from `.env` (loaded by `dotenv/config` before this import).
 *   3. The hardcoded application default: Asia/Jakarta (WIB, UTC+7).
 *
 * With TZ set, `new Date()` wall-clock formatting, MariaDB driver-adapter
 * DATETIME serialisation and log timestamps all operate in WIB.
 */

const DEFAULT_TIMEZONE = "Asia/Jakarta";

if (!process.env.TZ) {
  process.env.TZ = DEFAULT_TIMEZONE;
}

/** The IANA timezone active for this process. */
export const APP_TIMEZONE = process.env.TZ;