import "server-only";

import { redis } from "@/lib/redis/client";
import type { PairingChallenge } from "@/lib/whatsapp/types";

const CHALLENGE_TTL_SECONDS = 180;
const PAIRING_LOCK_PREFIX = "device:pairing-lock:";

function challengeKey(deviceId: string): string {
  return `device:challenge:${deviceId}`;
}

export async function claimPairing(deviceId: string, ttlSeconds: number): Promise<boolean> {
  const result = await redis().set(
    `${PAIRING_LOCK_PREFIX}${deviceId}`,
    "1",
    "EX",
    ttlSeconds,
    "NX",
  );
  return result === "OK";
}

/**
 * Extends an existing pairing lock.
 *
 * WhatsApp forces a socket rebuild right after a successful pairing (status
 * 515). That rebuild can outlive the original challenge TTL, so the lock is
 * refreshed to keep a concurrent pairing request from interrupting it.
 */
export async function renewPairing(deviceId: string, ttlSeconds: number): Promise<void> {
  await redis().set(`${PAIRING_LOCK_PREFIX}${deviceId}`, "1", "EX", ttlSeconds);
}

export async function releasePairing(deviceId: string): Promise<void> {
  await redis().del(`${PAIRING_LOCK_PREFIX}${deviceId}`);
}

export async function storeDeviceChallenge(
  deviceId: string,
  challenge: PairingChallenge,
): Promise<void> {
  await redis().set(
    challengeKey(deviceId),
    JSON.stringify(challenge),
    "EX",
    CHALLENGE_TTL_SECONDS,
  );
}

export async function readDeviceChallenge(
  deviceId: string,
): Promise<PairingChallenge | null> {
  const raw = await redis().get(challengeKey(deviceId));
  if (!raw) return null;

  let parsed: PairingChallenge & { expiresAt: string };
  try {
    parsed = JSON.parse(raw) as PairingChallenge & { expiresAt: string };
  } catch {
    await clearDeviceChallenge(deviceId);
    return null;
  }
  if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
    await clearDeviceChallenge(deviceId);
    return null;
  }
  return { ...parsed, expiresAt: new Date(parsed.expiresAt) };
}

export async function clearDeviceChallenge(deviceId: string): Promise<void> {
  await redis().del(challengeKey(deviceId));
}
