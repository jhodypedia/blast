/**
 * Date/time utilities for WIB (Asia/Jakarta) timezone.
 *
 * All server-side Date operations use WIB timezone (set via process.env.TZ).
 * These helpers provide consistent formatting for display in UI and logs.
 */

const WIB_TIMEZONE = "Asia/Jakarta";

/**
 * Formats a Date object to WIB date string (DD/MM/YYYY).
 *
 * @param date - Date object (defaults to now)
 * @returns Formatted date string in DD/MM/YYYY format
 */
export function formatWIBDate(date: Date = new Date()): string {
  return date.toLocaleDateString("id-ID", {
    timeZone: WIB_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Formats a Date object to WIB time string (HH:mm:ss).
 *
 * @param date - Date object (defaults to now)
 * @returns Formatted time string in HH:mm:ss format
 */
export function formatWIBTime(date: Date = new Date()): string {
  return date.toLocaleTimeString("id-ID", {
    timeZone: WIB_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * Formats a Date object to WIB datetime string (DD/MM/YYYY HH:mm:ss).
 *
 * @param date - Date object (defaults to now)
 * @returns Formatted datetime string in DD/MM/YYYY HH:mm:ss format
 */
export function formatWIBDateTime(date: Date = new Date()): string {
  return `${formatWIBDate(date)} ${formatWIBTime(date)}`;
}

/**
 * Formats a Date object to relative time (e.g., "5 menit yang lalu").
 *
 * @param date - Date object to compare
 * @param baseDate - Base date to compare against (defaults to now)
 * @returns Relative time string in Indonesian
 */
export function formatRelativeTime(
  date: Date,
  baseDate: Date = new Date(),
): string {
  const diffMs = baseDate.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return "baru saja";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} menit yang lalu`;
  }
  if (diffHours < 24) {
    return `${diffHours} jam yang lalu`;
  }
  if (diffDays < 7) {
    return `${diffDays} hari yang lalu`;
  }

  return formatWIBDate(date);
}

/**
 * Returns the current time in WIB timezone.
 * Useful for logging and debugging.
 */
export function nowWIB(): Date {
  return new Date();
}

/**
 * Converts a UTC timestamp to WIB formatted string.
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted datetime string in DD/MM/YYYY HH:mm:ss format
 */
export function timestampToWIB(timestamp: number): string {
  return formatWIBDateTime(new Date(timestamp));
}

// ---------------------------------------------------------------------------
// ISO-style WIB helpers (drop-in replacements for `toISOString().slice(...)`,
// which always renders UTC). Every helper renders the Asia/Jakarta wall clock
// explicitly, independent of the process timezone.
// ---------------------------------------------------------------------------

const WIB_PARTS_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: WIB_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

type WIBParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
};

function wibParts(date: Date): WIBParts {
  const parts = WIB_PARTS_FORMAT.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPart["type"]): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** WIB date as `YYYY-MM-DD` (replaces `toISOString().slice(0, 10)`). */
export function toWIBDate(date: Date): string {
  const p = wibParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

/** WIB datetime as `YYYY-MM-DD HH:mm` (replaces `toISOString().slice(0, 16)`). */
export function toWIBDateTimeShort(date: Date): string {
  const p = wibParts(date);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** WIB datetime as `YYYY-MM-DD HH:mm:ss`. */
export function toWIBDateTimeFull(date: Date): string {
  const p = wibParts(date);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/** WIB value for `<input type="datetime-local">`: `YYYY-MM-DDTHH:mm`. */
export function toWIBDateTimeInput(date: Date): string {
  const p = wibParts(date);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}