import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ConnectionUpdate } from "@/lib/whatsapp/types";

/**
 * Paired-number reconciliation.
 *
 * `Device` is unique on `[userId, phoneNumber]` and MySQL applies that index to
 * soft-deleted rows as well, so a removed or dead slot that still holds a number
 * used to make the `CONNECTED` write fail with P2002 — an unhandled rejection
 * inside the adapter's event handler, which killed the worker process and left
 * the device stuck in CONNECTING.
 */

type DeviceRow = {
  id: string;
  userId: string;
  status: string;
  deletedAt: Date | null;
  phoneNumber: string | null;
  lastErrorCode?: string | null;
};

const DEVICE_ID = "device-live";
const USER_ID = "user-1";
const NUMBER = "6288989494927";

let devices: DeviceRow[] = [];
let updateThrowsUnique = false;

const findFirst = vi.fn(async () => ({
  id: DEVICE_ID,
  userId: USER_ID,
  status: "CONNECTING",
  user: { status: "ACTIVE", deletedAt: null },
}));

const findMany = vi.fn(
  async (args: {
    where: { userId: string; phoneNumber: string; id: { not: string } };
    select: unknown;
  }) =>
    devices.filter(
      (row) =>
        row.userId === args.where.userId &&
        row.phoneNumber === args.where.phoneNumber &&
        row.id !== args.where.id.not,
    ),
);

const update = vi.fn(
  async (args: { where: { id: string }; data: Record<string, unknown> }) => {
    if (updateThrowsUnique && "phoneNumber" in args.data) {
      throw Object.assign(new Error("Unique constraint failed"), {
        code: "P2002",
      });
    }
    const row = devices.find((item) => item.id === args.where.id);
    if (row) Object.assign(row, args.data);
    return row ?? {};
  },
);

const updateMany = vi.fn(
  async (args: {
    where: { id?: { in?: string[] } };
    data: Record<string, unknown>;
  }) => {
    const ids = args.where.id?.in ?? [];
    let count = 0;
    for (const row of devices) {
      if (ids.includes(row.id)) {
        Object.assign(row, args.data);
        count += 1;
      }
    }
    return { count };
  },
);

const prisma = {
  device: { findFirst, findMany, update, updateMany, findUnique: vi.fn() },
  blastJob: { count: vi.fn(async () => 0) },
};

vi.mock("@/lib/db/prisma", () => ({ prisma }));

let capturedOnUpdate:
  | ((update: ConnectionUpdate) => Promise<void>)
  | undefined;

const connect = vi.fn(
  async (params: { onUpdate?: (u: ConnectionUpdate) => Promise<void> }) => {
    capturedOnUpdate = params.onUpdate;
  },
);
const disconnect = vi.fn(async () => {});

vi.mock("@/lib/whatsapp/adapter", () => ({
  whatsappAdapter: { connect, disconnect },
}));

const releasePairing = vi.fn(async () => {});
const renewPairing = vi.fn(async () => {});
const clearDeviceChallenge = vi.fn(async () => {});
const storeDeviceChallenge = vi.fn(async () => {});

vi.mock("@/lib/device/challenge-store", () => ({
  releasePairing,
  renewPairing,
  clearDeviceChallenge,
  storeDeviceChallenge,
}));

const enqueueDeviceSession = vi.fn(async () => {});

vi.mock("@/lib/queue/queues", () => ({ enqueueDeviceSession }));

const { processDeviceSession } = await import("@/worker/device-session-runner");

function liveDevice(): DeviceRow {
  return {
    id: DEVICE_ID,
    userId: USER_ID,
    status: "CONNECTING",
    deletedAt: null,
    phoneNumber: null,
  };
}

async function pairAndReport(): Promise<void> {
  await processDeviceSession({
    deviceId: DEVICE_ID,
    action: "CONNECT",
    pairing: { method: "PAIR_CODE", normalizedNumber: NUMBER },
  });
  await capturedOnUpdate?.({
    deviceId: DEVICE_ID,
    state: "CONNECTED",
    normalizedNumber: NUMBER,
  });
}

function deviceRow(id: string): DeviceRow {
  const row = devices.find((item) => item.id === id);
  if (!row) throw new Error(`No device row ${id}`);
  return row;
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedOnUpdate = undefined;
  updateThrowsUnique = false;
  devices = [liveDevice()];
});

describe("processDeviceSession paired-number handling", () => {
  it("records the number when no other slot holds it", async () => {
    await pairAndReport();

    expect(deviceRow(DEVICE_ID)).toMatchObject({
      status: "CONNECTED",
      phoneNumber: NUMBER,
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("takes the number from a soft-deleted slot of the same owner", async () => {
    devices.push({
      id: "device-removed",
      userId: USER_ID,
      status: "DISCONNECTED",
      deletedAt: new Date(),
      phoneNumber: NUMBER,
    });

    await pairAndReport();

    expect(deviceRow("device-removed").phoneNumber).toBeNull();
    expect(deviceRow(DEVICE_ID)).toMatchObject({
      status: "CONNECTED",
      phoneNumber: NUMBER,
    });
  });

  it("takes the number from a dead slot of the same owner", async () => {
    devices.push({
      id: "device-stale",
      userId: USER_ID,
      status: "ERROR",
      deletedAt: null,
      phoneNumber: NUMBER,
    });

    await pairAndReport();

    expect(deviceRow("device-stale").phoneNumber).toBeNull();
    expect(deviceRow(DEVICE_ID).phoneNumber).toBe(NUMBER);
  });

  it("refuses the session when a connected slot already holds the number", async () => {
    devices.push({
      id: "device-connected",
      userId: USER_ID,
      status: "CONNECTED",
      deletedAt: null,
      phoneNumber: NUMBER,
    });

    await pairAndReport();

    // One account must not occupy two live slots, or it would send at twice its
    // configured pace.
    expect(deviceRow("device-connected").phoneNumber).toBe(NUMBER);
    expect(deviceRow(DEVICE_ID)).toMatchObject({
      status: "ERROR",
      lastErrorCode: "NUMBER_ALREADY_LINKED",
      phoneNumber: null,
    });
    expect(disconnect).toHaveBeenCalledWith(DEVICE_ID);
    expect(releasePairing).toHaveBeenCalledWith(DEVICE_ID);
  });

  it("survives a unique violation raced past the claim check", async () => {
    updateThrowsUnique = true;

    await expect(pairAndReport()).resolves.toBeUndefined();

    expect(deviceRow(DEVICE_ID).lastErrorCode).toBe("NUMBER_ALREADY_LINKED");
  });

  it("rethrows unrelated write failures", async () => {
    update.mockRejectedValueOnce(new Error("connection lost"));

    await processDeviceSession({
      deviceId: DEVICE_ID,
      action: "CONNECT",
      pairing: { method: "QR" },
    });

    await expect(
      capturedOnUpdate?.({ deviceId: DEVICE_ID, state: "CONNECTED" }),
    ).rejects.toThrow("connection lost");
  });
});
