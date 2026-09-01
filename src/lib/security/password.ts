import "server-only";

import { randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";

/**
 * Password hashing.
 *
 * bcrypt with cost 12 (RULES.md §9). Verification always runs the full compare
 * so timing does not reveal whether an account exists — see
 * {@link verifyPasswordAgainstDummy}.
 */

const BCRYPT_COST = 12;

/**
 * Lazily computed hash of a random, unusable password. Comparing against it
 * spends the same CPU as a real verification, so response timing does not
 * reveal whether an account exists.
 */
let dummyHashPromise: Promise<string> | null = null;

function dummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = bcrypt.hash(
      `unusable:${randomBytes(24).toString("base64url")}`,
      BCRYPT_COST,
    );
  }
  return dummyHashPromise;
}

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_COST);
}

export async function verifyPassword(
  plaintext: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

/** Burns equivalent CPU time for a non-existent account. Always returns false. */
export async function verifyPasswordAgainstDummy(
  plaintext: string,
): Promise<false> {
  await bcrypt.compare(plaintext, await dummyHash());
  return false;
}

/** True when an existing hash was produced with a weaker cost factor. */
export function needsRehash(hash: string): boolean {
  const match = /^\$2[aby]\$(\d{2})\$/.exec(hash);
  if (!match) {
    return true;
  }
  return Number(match[1]) < BCRYPT_COST;
}
