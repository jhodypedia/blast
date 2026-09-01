import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { serverEnv } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const VERSION = "v1";

let cachedKey: Buffer | null = null;

function encryptionKey(): Buffer {
  if (cachedKey) {
    return cachedKey;
  }

  const raw = Buffer.from(serverEnv().ENCRYPTION_KEY, "base64");
  if (raw.length !== KEY_LENGTH) {
    throw new Error(
      `ENCRYPTION_KEY must decode to exactly ${KEY_LENGTH} bytes (got ${raw.length}). ` +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }

  cachedKey = raw;
  return cachedKey;
}

/**
 * Encrypts plaintext for storage at rest (WhatsApp credentials, wallet data).
 *
 * Output format: `v1.<iv>.<authTag>.<ciphertext>` with each part base64url so
 * the value is safe to store in a `TEXT` column and to log-scrub by prefix.
 */
export function encryptToString(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

/** Reverses {@link encryptToString}. Throws when the payload was tampered with. */
export function decryptFromString(payload: string): string {
  const [version, ivPart, tagPart, dataPart] = payload.split(".");
  if (version !== VERSION || !ivPart || !tagPart || !dataPart) {
    throw new Error("Malformed ciphertext payload");
  }

  const iv = Buffer.from(ivPart, "base64url");
  const authTag = Buffer.from(tagPart, "base64url");
  const ciphertext = Buffer.from(dataPart, "base64url");

  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Malformed ciphertext payload");
  }

  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

/** Encrypts an arbitrary JSON-serialisable value. */
export function encryptJson(value: unknown): string {
  return encryptToString(JSON.stringify(value));
}

/** Decrypts a value produced by {@link encryptJson}. */
export function decryptJson<T>(payload: string): T {
  return JSON.parse(decryptFromString(payload)) as T;
}

/**
 * One-way hash for values that must be correlatable but never readable, such
 * as IP addresses in security logs.
 */
export function hashForLogging(value: string): string {
  return createHash("sha256")
    .update(`${serverEnv().ENCRYPTION_KEY}:${value}`)
    .digest("base64url")
    .slice(0, 32);
}

/**
 * Stable, non-reversible reference for a recipient phone number. Used in
 * delivery logs and USER-facing payloads so raw numbers are never exposed.
 */
export function recipientReference(
  campaignId: string,
  normalizedNumber: string,
): string {
  return createHash("sha256")
    .update(`${serverEnv().ENCRYPTION_KEY}:${campaignId}:${normalizedNumber}`)
    .digest("base64url")
    .slice(0, 24);
}

/** Constant-time string comparison for tokens and shared secrets. */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}
