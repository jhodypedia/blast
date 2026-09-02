/**
 * Domain constants shared by validation, services, workers and UI.
 * These are compile-time defaults; runtime-configurable values live in the
 * `Setting` table and are read through the settings service.
 */

/** Only these sending speeds are ever accepted (RULES.md §12). */
export const ALLOWED_SPEED_SECONDS = [1, 3, 6, 10] as const;
export type AllowedSpeedSeconds = (typeof ALLOWED_SPEED_SECONDS)[number];

export function isAllowedSpeed(value: number): value is AllowedSpeedSeconds {
  return (ALLOWED_SPEED_SECONDS as readonly number[]).includes(value);
}

/** Default device cap per USER; overridable by ADMIN via settings. */
export const DEFAULT_MAX_DEVICES_PER_USER = 4;

/** Upper bound the admin UI will accept for the device cap. */
export const MAX_DEVICES_PER_USER_LIMIT = 20;

/** Recipient lease duration and heartbeat interval, in milliseconds. */
export const RECIPIENT_LEASE_MS = 60_000;
export const RECIPIENT_HEARTBEAT_MS = 20_000;

/** Bounded reconnect policy for registered WhatsApp sessions. */
export const MAX_DEVICE_RECONNECT_ATTEMPTS = 5;
export const DEVICE_RECONNECT_BACKOFF_MS = [5_000, 15_000, 30_000, 60_000, 120_000] as const;

/** How long a `SENDING` row may stay untouched before reconciliation. */
export const SENDING_STALE_MS = 5 * 60_000;

/** Target import chunk size for streaming inserts. */
export const TARGET_IMPORT_CHUNK_SIZE = 1_000;

/** Hard cap on uploaded target file size (bytes). */
export const MAX_TARGET_FILE_BYTES = 20 * 1024 * 1024;

/** Maximum numbers accepted from one target upload. */
export const MAX_TARGET_NUMBERS = 100_000;

/** Accepted target upload MIME types (TXT/CSV only — RULES.md §11). */
export const ACCEPTED_TARGET_MIME_TYPES = [
  "text/plain",
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
] as const;

export const ACCEPTED_TARGET_EXTENSIONS = [".txt", ".csv"] as const;

/** Monetary precision used across ledger, payout and withdrawal maths. */
export const MONEY_DECIMAL_PLACES = 4;
export const DEFAULT_CURRENCY = "IDR";

/** Withdrawal bounds; the effective values come from settings. */
export const DEFAULT_MIN_WITHDRAWAL_AMOUNT = "50000";
export const DEFAULT_WITHDRAWAL_FEE = "0";

/** Default country used only for local numbers without a prefix. */
export const DEFAULT_COUNTRY_CODE = "ID";

/** Retention windows for prunable logs, in days. */
export const DELIVERY_LOG_RETENTION_DAYS = 90;
export const OPERATIONAL_LOG_RETENTION_DAYS = 30;

/** Queue names. Kept in one place so web and worker never drift. */
export const QUEUE_NAMES = {
  targetImport: "target-import",
  blastDelivery: "blast-delivery",
  deviceSession: "device-session",
  maintenance: "maintenance",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** Settings keys. Unique per row via the `Setting.key` primary key. */
export const SETTING_KEYS = {
  maxDevicesPerUser: "device.max_per_user",
  pairCodeEnabled: "device.pair_code_enabled",
  customPairingCode: "device.custom_pairing_code",
  qrEnabled: "device.qr_enabled",
  deviceInactivityDays: "device.inactivity_days",
  defaultCountryCode: "target.default_country_code",
  maxTargetFileBytes: "target.max_file_bytes",
  minWithdrawalAmount: "withdrawal.min_amount",
  withdrawalFee: "withdrawal.fee",
  withdrawalsEnabled: "withdrawal.enabled",
  registrationEnabled: "auth.registration_enabled",
  sessionHours: "auth.session_hours",
  maintenanceMode: "platform.maintenance_mode",
  allowedSpeeds: "blast.allowed_speeds",
  maxActiveJobsPerUser: "blast.max_active_jobs_per_user",
  defaultPayoutPerSend: "blast.default_payout_per_send",
  defaultCurrency: "blast.default_currency",
  deliveryLogRetentionDays: "retention.delivery_log_days",
} as const;
