import "server-only";

import pino, { type Logger } from "pino";

import { serverEnv } from "@/lib/env";

/**
 * Keys that must never reach any log sink (RULES.md §16).
 * Redaction is applied structurally rather than relying on call sites.
 */
const REDACTED_PATHS = [
  "password",
  "passwordHash",
  "currentPassword",
  "newPassword",
  "confirmPassword",
  "token",
  "accessToken",
  "refreshToken",
  "authorization",
  "cookie",
  "secret",
  "turnstileToken",
  "qr",
  "qrCode",
  "pairCode",
  "pairingCode",
  "credentials",
  "credentialsCiphertext",
  "accountNumber",
  "accountNumberCiphertext",
  "fullNameCiphertext",
  "normalizedNumber",
  "phoneNumber",
  "numbers",
  "targets",
  "*.password",
  "*.passwordHash",
  "*.token",
  "*.secret",
  "*.pairCode",
  "*.qr",
  "*.normalizedNumber",
  "*.phoneNumber",
  "*.accountNumber",
];

let cachedLogger: Logger | null = null;

function baseLogger(): Logger {
  if (cachedLogger) {
    return cachedLogger;
  }

  const env = serverEnv();

  cachedLogger = pino({
    level: env.LOG_LEVEL,
    redact: {
      paths: REDACTED_PATHS,
      censor: "[redacted]",
    },
    base: { app: "wablast" },
    formatters: {
      level: (label) => ({ level: label }),
    },
  });

  return cachedLogger;
}

export type LogScope =
  | "web"
  | "auth"
  | "db"
  | "security"
  | "campaign"
  | "target"
  | "device"
  | "blast"
  | "delivery"
  | "queue"
  | "worker"
  | "ledger"
  | "withdrawal"
  | "settings"
  | "cleanup";

/** Returns a child logger bound to an operational scope. */
export function logger(scope: LogScope): Logger {
  return baseLogger().child({ scope });
}
