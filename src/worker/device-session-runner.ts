import "server-only";

import { prisma } from "@/lib/db/prisma";
import {
  DEVICE_RECONNECT_BACKOFF_MS,
  MAX_DEVICE_RECONNECT_ATTEMPTS,
} from "@/lib/constants";
import { logger } from "@/lib/observability/logger";
import { whatsappAdapter } from "@/lib/whatsapp/adapter";
import {
  enqueueDeviceSession,
  type DeviceSessionJobData,
} from "@/lib/queue/queues";
import {
  clearDeviceChallenge,
  releasePairing,
  renewPairing,
  storeDeviceChallenge,
} from "@/lib/device/challenge-store";

/**
 * Device session processor.
 *
 * Pairing challenges (QR payloads and pair codes) are short-lived and are held
 * only in Redis with a TTL. They are never written to the database, to logs, or
 * to any audit record (RULES.md §8, §16).
 */

/**
 * Lock window granted to the adapter's post-pairing socket rebuild (status 515),
 * long enough for the bounded restart attempts to finish.
 */
const PAIRING_RESTART_TTL_SECONDS = 120;

/** Prisma's unique-constraint violation. */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/**
 * Frees a WhatsApp number from the owner's other device slots so the freshly
 * paired one can record it.
 *
 * `Device` is unique on `[userId, phoneNumber]`, and MySQL applies that index to
 * soft-deleted rows too, so a removed or long-dead slot would otherwise block its
 * number from ever being paired again: the state write fails with P2002 and the
 * device is stranded in CONNECTING. A slot that is currently CONNECTED keeps the
 * number instead — one WhatsApp account must not occupy two live slots, or it
 * would send at twice its configured pace.
 *
 * Returns false when another live slot keeps the number.
 */
async function claimDeviceNumber(params: {
  deviceId: string;
  userId: string;
  normalizedNumber: string;
}): Promise<boolean> {
  const holders = await prisma.device.findMany({
    where: {
      userId: params.userId,
      phoneNumber: params.normalizedNumber,
      id: { not: params.deviceId },
    },
    select: { id: true, status: true, deletedAt: true },
  });

  if (holders.length === 0) {
    return true;
  }
  if (
    holders.some(
      (holder) => !holder.deletedAt && holder.status === "CONNECTED",
    )
  ) {
    return false;
  }

  await prisma.device.updateMany({
    where: { id: { in: holders.map((holder) => holder.id) } },
    data: { phoneNumber: null },
  });
  return true;
}

/**
 * Refuses a session whose number already belongs to another live slot.
 *
 * The socket is closed rather than logged out, so the credentials survive for the
 * owner to keep once the other slot is freed.
 */
async function rejectDuplicateNumber(deviceId: string): Promise<void> {
  await whatsappAdapter.disconnect(deviceId);
  await clearDeviceChallenge(deviceId);
  await releasePairing(deviceId);
  await prisma.device.update({
    where: { id: deviceId },
    data: {
      status: "ERROR",
      lastSeenAt: new Date(),
      lastErrorCode: "NUMBER_ALREADY_LINKED",
    },
  });

  logger("device").warn(
    { event: "device.number_already_linked", deviceId },
    "Refused a paired session because its number is linked to another device",
  );
}

export async function processDeviceSession(
  data: DeviceSessionJobData,
): Promise<void> {
  const log = logger("device");

  const device = await prisma.device.findFirst({
    where: { id: data.deviceId, deletedAt: null },
    select: {
      id: true,
      userId: true,
      status: true,
      user: { select: { status: true, deletedAt: true } },
    },
  });

  if (!device) {
    return;
  }

  // A suspended owner may never hold a live session.
  if (device.user.status !== "ACTIVE" || device.user.deletedAt) {
    await whatsappAdapter.disconnect(device.id);
    await clearDeviceChallenge(device.id);
    await releasePairing(device.id);
    await prisma.device.update({
      where: { id: device.id },
      data: { status: "DISCONNECTED" },
    });
    return;
  }

  if (data.action === "DISCONNECT") {
    await whatsappAdapter.disconnect(device.id);
    await clearDeviceChallenge(device.id);
    await releasePairing(device.id);
    await prisma.device.update({
      where: { id: device.id },
      data: { status: "DISCONNECTED" },
    });
    return;
  }

  if (data.action === "REFRESH") {
    await whatsappAdapter.disconnect(device.id);
  }

  try {
    await whatsappAdapter.connect({
      deviceId: device.id,
      ...(data.pairing ? { pairing: data.pairing } : {}),
      onChallenge: async (challenge) => {
        await storeDeviceChallenge(device.id, challenge);
      },
      onUpdate: async (update) => {
        // WhatsApp only reveals the paired number once the socket opens, so the
        // unique `[userId, phoneNumber]` slot is settled here rather than when
        // pairing was requested.
        if (update.normalizedNumber) {
          const claimed = await claimDeviceNumber({
            deviceId: device.id,
            userId: device.userId,
            normalizedNumber: update.normalizedNumber,
          });
          if (!claimed) {
            await rejectDuplicateNumber(device.id);
            return;
          }
        }

        try {
          await prisma.device.update({
            where: { id: device.id },
            data: {
              status: update.state,
              ...(update.normalizedNumber
                ? { phoneNumber: update.normalizedNumber }
                : {}),
              ...(update.state === "CONNECTED"
                ? { lastConnectedAt: new Date(), reconnectAttempts: 0 }
                : {}),
              lastSeenAt: new Date(),
              lastErrorCode: update.errorCode ?? null,
            },
          });
        } catch (error) {
          // Two sessions carrying the same number can clear the claim check at
          // once. This callback runs inside the adapter's event handler, so the
          // loser throwing here would surface as an unhandled rejection and take
          // the whole worker process down.
          if (update.normalizedNumber && isUniqueConstraintError(error)) {
            await rejectDuplicateNumber(device.id);
            return;
          }
          throw error;
        }

        // `restarting` marks the mandatory post-pairing socket rebuild
        // (WhatsApp status 515). The adapter owns that retry, so the pairing
        // lock is held for the rebuild instead of being released, and no
        // reconnect is scheduled. The challenge itself is already spent.
        if (update.restarting) {
          await clearDeviceChallenge(device.id);
          await renewPairing(device.id, PAIRING_RESTART_TTL_SECONDS);
        } else if (
          ["CONNECTED", "ERROR", "EXPIRED", "DISCONNECTED"].includes(update.state)
        ) {
          await clearDeviceChallenge(device.id);
          await releasePairing(device.id);
        }

        if (
          !update.restarting &&
          update.state === "DISCONNECTED" &&
          !update.requiresReauth &&
          !data.pairing
        ) {
          const changed = await prisma.device.updateMany({
            where: { id: device.id, status: "DISCONNECTED" },
            data: { reconnectAttempts: { increment: 1 } },
          });
          if (changed.count === 1) {
            const attempt = await prisma.device.findUnique({
              where: { id: device.id },
              select: { reconnectAttempts: true },
            });
            if (attempt && attempt.reconnectAttempts <= MAX_DEVICE_RECONNECT_ATTEMPTS) {
              const delay = DEVICE_RECONNECT_BACKOFF_MS[attempt.reconnectAttempts - 1] ?? DEVICE_RECONNECT_BACKOFF_MS[DEVICE_RECONNECT_BACKOFF_MS.length - 1];
              await enqueueDeviceSession(
                { deviceId: device.id, action: "CONNECT" },
                { delay },
              );
            }
          }
        }

        log.info(
          {
            event: "device.state_changed",
            deviceId: device.id,
            state: update.state,
          },
          "Device connection state updated",
        );
      },
    });
  } catch (error) {
    await clearDeviceChallenge(device.id);
    await releasePairing(device.id);
    await prisma.device.updateMany({
      where: { id: device.id, status: "CONNECTING" },
      data: { status: "ERROR", lastErrorCode: "SESSION_CONNECT_FAILED" },
    });
    throw error;
  }
}
