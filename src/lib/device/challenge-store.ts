import "server-only";

import { redis } from "@/lib/redis/client";
import type { PairingChallenge } from "@/lib/whatsapp/types";

const CHALLENGE_TTL_SECONDS = 180;

function challengeKey(deviceId: string): string {
  return `device:challenge:${deviceId}`;
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

  const parsed = JSON.parse(raw) as PairingChallenge & { expiresAt: string };
  if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
    await clearDeviceChallenge(deviceId);
    return null;
  }
  return { ...parsed, expiresAt: new Date(parsed.expiresAt) };
}

export async function clearDeviceChallenge(deviceId: string): Promise<void> {
  await redis().del(challengeKey(deviceId));
}
