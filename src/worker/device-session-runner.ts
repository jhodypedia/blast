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

export async function processDeviceSession(
  data: DeviceSessionJobData,
): Promise<void> {
  const log = logger("device");

  const device = await prisma.device.findFirst({
    where: { id: data.deviceId, deletedAt: null },
    select: {
      id: true,
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
