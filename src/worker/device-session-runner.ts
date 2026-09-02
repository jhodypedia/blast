import "server-only";

import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/logger";
import { whatsappAdapter } from "@/lib/whatsapp/adapter";
import type { DeviceSessionJobData } from "@/lib/queue/queues";
import {
  clearDeviceChallenge,
  storeDeviceChallenge,
} from "@/lib/device/challenge-store";

/**
 * Device session processor.
 *
 * Pairing challenges (QR payloads and pair codes) are short-lived and are held
 * only in Redis with a TTL. They are never written to the database, to logs, or
 * to any audit record (RULES.md §8, §16).
 */

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
    await prisma.device.update({
      where: { id: device.id },
      data: { status: "DISCONNECTED" },
    });
    return;
  }

  if (data.action === "DISCONNECT") {
    await whatsappAdapter.disconnect(device.id);
    await prisma.device.update({
      where: { id: device.id },
      data: { status: "DISCONNECTED" },
    });
    return;
  }

  if (data.action === "REFRESH") {
    await whatsappAdapter.disconnect(device.id);
  }

  await whatsappAdapter.connect({
    deviceId: device.id,
    pairing: data.pairing ?? { method: "QR" },
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

      if (update.requiresReauth) {
        await clearDeviceChallenge(device.id);
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
}
