import "server-only";

import { prisma } from "@/lib/db/prisma";
import {
  conflict,
  forbidden,
  invalidState,
  notFound,
  validationError,
} from "@/lib/errors";
import { getSetting } from "@/lib/settings/service";
import { SETTING_KEYS } from "@/lib/constants";
import { maskPhoneNumber, normalizePhoneNumber } from "@/lib/phone/normalize";
import { enqueueDeviceSession } from "@/lib/queue/queues";
import type { DeviceSessionJobData } from "@/lib/queue/queues";
import { recordAudit } from "@/lib/audit/service";
import { logger } from "@/lib/observability/logger";
import {
  claimPairing,
  clearDeviceChallenge,
  releasePairing,
} from "@/lib/device/challenge-store";

/**
 * Device service (RULES.md §8).
 *
 * The per-user device cap is enforced inside a serialisable transaction, so
 * parallel requests cannot both observe a free slot.
 */

export type DeviceSummary = {
  id: string;
  label: string;
  status: "CONNECTING" | "CONNECTED" | "DISCONNECTED" | "EXPIRED" | "ERROR";
  /** Masked; the full number is never sent to the browser. */
  maskedNumber: string | null;
  lastConnectedAt: Date | null;
  lastSeenAt: Date | null;
  createdAt: Date;
};

/** Lists the caller's own devices. */
export async function listUserDevices(userId: string): Promise<DeviceSummary[]> {
  const devices = await prisma.device.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      label: true,
      status: true,
      phoneNumber: true,
      lastConnectedAt: true,
      lastSeenAt: true,
      createdAt: true,
    },
  });

  return devices.map((device) => ({
    id: device.id,
    label: device.label,
    status: device.status,
    maskedNumber: device.phoneNumber
      ? maskPhoneNumber(device.phoneNumber)
      : null,
    lastConnectedAt: device.lastConnectedAt,
    lastSeenAt: device.lastSeenAt,
    createdAt: device.createdAt,
  }));
}

/**
 * Creates a device slot for the caller.
 *
 * Counting and inserting happen in one serialisable transaction so the cap
 * cannot be bypassed by concurrent requests.
 */
export async function createDevice(params: {
  userId: string;
}): Promise<{ deviceId: string }> {
  const maxDevices = await getSetting(SETTING_KEYS.maxDevicesPerUser);

  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.device.count({
        where: { userId: params.userId, deletedAt: null },
      });

      if (existing >= maxDevices) {
        throw conflict(
          `You can connect at most ${maxDevices} devices. Remove one before adding another.`,
        );
      }

      const device = await tx.device.create({
        data: {
          userId: params.userId,
          label: `Perangkat ${existing + 1}`,
          status: "DISCONNECTED",
        },
        select: { id: true },
      });

      return { deviceId: device.id };
    },
    { isolationLevel: "Serializable", timeout: 10_000 },
  );
}

/** Loads a device the caller is allowed to act on. */
async function loadOwnedDevice(deviceId: string, userId: string) {
  const device = await prisma.device.findFirst({
    where: { id: deviceId, deletedAt: null },
    select: { id: true, userId: true, status: true, label: true },
  });

  if (!device) {
    throw notFound("This device no longer exists.");
  }
  if (device.userId !== userId) {
    throw forbidden(
      "You do not have permission to access this device.",
      `User ${userId} attempted to access device ${deviceId}`,
    );
  }
  return device;
}

/**
 * Starts a pairing flow. The QR/pair code itself is delivered later through the
 * authenticated status channel and is never persisted or logged (RULES.md §8).
 */
export async function requestPairing(params: {
  userId: string;
  deviceId: string;
  method: "QR" | "PAIR_CODE";
  phoneNumber?: string;
  countryCode?: string;
}): Promise<void> {
  const device = await loadOwnedDevice(params.deviceId, params.userId);

  if (device.status === "CONNECTED") {
    throw invalidState("This device is already connected.");
  }
  const pairingTtl = params.method === "QR" ? 70 : 190;
  if (!(await claimPairing(device.id, pairingTtl))) {
    throw invalidState("Koneksi perangkat sedang diproses. Tunggu hingga kode kedaluwarsa.");
  }

  const [qrEnabled, pairCodeEnabled, defaultCountry, customPairingCode] = await Promise.all([
    getSetting(SETTING_KEYS.qrEnabled),
    getSetting(SETTING_KEYS.pairCodeEnabled),
    getSetting(SETTING_KEYS.defaultCountryCode),
    getSetting(SETTING_KEYS.customPairingCode),
  ]);

  if (params.method === "QR" && !qrEnabled) {
    throw invalidState("QR pairing is currently disabled.");
  }
  if (params.method === "PAIR_CODE" && !pairCodeEnabled) {
    throw invalidState("Pair-code pairing is currently disabled.");
  }

  let pairing: DeviceSessionJobData["pairing"] = { method: "QR" };

  if (params.method === "PAIR_CODE") {
    const normalised = normalizePhoneNumber(
      params.phoneNumber ?? "",
      params.countryCode ?? defaultCountry,
    );
    if (!normalised.ok) {
      throw validationError("Enter a valid WhatsApp number.", {
        phoneNumber: ["The number could not be recognised"],
      });
    }
    pairing = {
      method: "PAIR_CODE",
      normalizedNumber: normalised.normalizedNumber,
      ...(customPairingCode ? { customCode: customPairingCode } : {}),
    };
  }

  await prisma.device.update({
    where: { id: device.id },
    data: { status: "CONNECTING", reconnectAttempts: 0, lastErrorCode: null },
  });
  await clearDeviceChallenge(device.id);

  try {
    await enqueueDeviceSession({
      deviceId: device.id,
      action: "CONNECT",
      pairing,
    });
  } catch (error) {
    await releasePairing(device.id);
    await prisma.device.updateMany({
      where: { id: device.id, status: "CONNECTING" },
      data: { status: "ERROR", lastErrorCode: "PAIRING_QUEUE_FAILED" },
    });
    throw error;
  }
}

/** Disconnects a device without discarding its stored session. */
export async function disconnectDevice(params: {
  userId: string;
  deviceId: string;
}): Promise<void> {
  const device = await loadOwnedDevice(params.deviceId, params.userId);

  const runningJobs = await prisma.blastJob.count({
    where: { deviceId: device.id, status: { in: ["QUEUED", "RUNNING"] } },
  });

  if (runningJobs > 0) {
    throw conflict(
      "Stop the blast jobs using this device before disconnecting it.",
    );
  }

  await enqueueDeviceSession({ deviceId: device.id, action: "DISCONNECT" });
  await prisma.device.update({
    where: { id: device.id },
    data: { status: "DISCONNECTED" },
  });
}

/** Soft-deletes a device and clears its stored credentials. */
export async function removeDevice(params: {
  userId: string;
  deviceId: string;
}): Promise<void> {
  const device = await loadOwnedDevice(params.deviceId, params.userId);

  const runningJobs = await prisma.blastJob.count({
    where: {
      deviceId: device.id,
      status: { in: ["QUEUED", "RUNNING", "PAUSED"] },
    },
  });
  if (runningJobs > 0) {
    throw conflict("Stop the blast jobs using this device before removing it.");
  }

  await enqueueDeviceSession({ deviceId: device.id, action: "DISCONNECT" });

  await prisma.$transaction(async (tx) => {
    await tx.deviceAuthState.deleteMany({ where: { deviceId: device.id } });
    await tx.device.update({
      where: { id: device.id },
      data: {
        status: "DISCONNECTED",
        credentialsCiphertext: null,
        deletedAt: new Date(),
      },
    });
  });

  logger("device").info(
    { event: "device.removed", deviceId: device.id },
    "Device removed by owner",
  );
}

/** ADMIN force-disconnect with audit trail. */
export async function adminForceDisconnect(params: {
  adminUserId: string;
  deviceId: string;
  reason: string;
}): Promise<void> {
  const device = await prisma.device.findFirst({
    where: { id: params.deviceId, deletedAt: null },
    select: { id: true, status: true },
  });

  if (!device) {
    throw notFound("This device no longer exists.");
  }

  await enqueueDeviceSession({ deviceId: device.id, action: "DISCONNECT" });

  await prisma.$transaction(async (tx) => {
    await tx.device.update({
      where: { id: device.id },
      data: { status: "DISCONNECTED" },
    });

    await recordAudit(
      {
        actorUserId: params.adminUserId,
        actorRole: "ADMIN",
        action: "DEVICE_FORCE_DISCONNECT",
        resourceType: "DEVICE",
        resourceId: device.id,
        beforeSummary: { status: device.status },
        afterSummary: { status: "DISCONNECTED" },
        reason: params.reason,
      },
      tx,
    );
  });
}
