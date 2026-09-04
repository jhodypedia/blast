import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Auth-state write batching.
 *
 * Baileys hands `keys.set` an entire key set at once — a first registration
 * writes 30 pre-keys in one call. The original implementation mapped each key to
 * its own `upsert` inside `$transaction`, so a single call cost ~90 round trips
 * and blew past Prisma's 5s interactive transaction budget, aborting pairing
 * with "A rollback cannot be executed on an expired transaction". These tests
 * pin the batched shape: one delete plus one multi-row insert per call.
 */

type Call = { op: string; args: unknown };

const calls: Call[] = [];
let transactionOptions: unknown;

const tx = {
  deviceAuthState: {
    deleteMany: vi.fn((args: unknown) => {
      calls.push({ op: "tx.deleteMany", args });
      return Promise.resolve({ count: 0 });
    }),
    createMany: vi.fn((args: unknown) => {
      calls.push({ op: "tx.createMany", args });
      return Promise.resolve({ count: 0 });
    }),
  },
};

const prisma = {
  deviceAuthState: {
    // No stored row: `loadAuthState` initialises fresh creds. Returning an
    // object with a null ciphertext would instead send it down the decrypt path.
    findUnique: vi.fn((): Promise<{ ciphertext: string } | null> =>
      Promise.resolve(null),
    ),
    findMany: vi.fn(() => Promise.resolve([])),
    upsert: vi.fn((args: unknown) => {
      calls.push({ op: "upsert", args });
      return Promise.resolve({});
    }),
    deleteMany: vi.fn((args: unknown) => {
      calls.push({ op: "deleteMany", args });
      return Promise.resolve({ count: 0 });
    }),
  },
  device: { updateMany: vi.fn(() => Promise.resolve({ count: 0 })) },
  $transaction: vi.fn(
    async (fn: (client: typeof tx) => Promise<unknown>, options?: unknown) => {
      transactionOptions = options;
      calls.push({ op: "$transaction", args: options });
      return fn(tx);
    },
  ),
};

vi.mock("@/lib/db/prisma", () => ({ prisma }));

vi.mock("@rexxhayanasi/elaina-baileys", () => ({
  initAuthCreds: () => ({ registered: false }),
  proto: {
    Message: {
      AppStateSyncKeyData: {
        fromObject: (value: Record<string, unknown>) => ({
          revived: true,
          ...value,
        }),
      },
    },
  },
}));

const { loadAuthState } = await import("@/lib/whatsapp/auth-state");

beforeEach(() => {
  calls.length = 0;
  transactionOptions = undefined;
  vi.clearAllMocks();
  prisma.deviceAuthState.findUnique.mockResolvedValue(null);
});

/**
 * A loaded state with the bookkeeping from the initial creds write discarded, so
 * assertions only see what `keys.set` itself does.
 */
async function freshAuth() {
  const auth = await loadAuthState("device-1");
  calls.length = 0;
  transactionOptions = undefined;
  vi.clearAllMocks();
  return auth;
}

/** A first-registration key set: 30 pre-keys, exactly as Baileys emits it. */
function preKeySet(): Record<string, Record<string, unknown>> {
  const entries: Record<string, unknown> = {};
  for (let index = 1; index <= 30; index += 1) {
    entries[String(index)] = { public: Buffer.from([index]) };
  }
  return { "pre-key": entries };
}

describe("loadAuthState keys.set", () => {
  it("writes a 30-key set with one delete and one insert", async () => {
    const auth = await freshAuth();

    await auth.state.keys.set(preKeySet());

    expect(calls.map((call) => call.op)).toEqual([
      "$transaction",
      "tx.deleteMany",
      "tx.createMany",
    ]);
    expect(prisma.deviceAuthState.upsert).not.toHaveBeenCalled();

    const inserted = (tx.deviceAuthState.createMany.mock.calls[0]![0] as {
      data: Array<{ stateKey: string }>;
    }).data;
    expect(inserted).toHaveLength(30);
    expect(inserted[0]!.stateKey).toBe("pre-key:1");
  });

  it("raises the transaction budget above the 5s default", async () => {
    const auth = await freshAuth();

    await auth.state.keys.set(preKeySet());

    expect(transactionOptions).toMatchObject({ timeout: 15_000 });
  });

  it("deletes keys set to null and does not insert them", async () => {
    const auth = await freshAuth();

    await auth.state.keys.set({
      "pre-key": { "1": null, "2": { public: Buffer.from([2]) } },
    });

    expect(tx.deviceAuthState.deleteMany).toHaveBeenCalledWith({
      where: {
        deviceId: "device-1",
        stateKey: { in: ["pre-key:1", "pre-key:2"] },
      },
    });

    const inserted = (tx.deviceAuthState.createMany.mock.calls[0]![0] as {
      data: Array<{ stateKey: string }>;
    }).data;
    expect(inserted.map((row) => row.stateKey)).toEqual(["pre-key:2"]);
  });

  it("skips the transaction entirely for an empty set", async () => {
    const auth = await freshAuth();

    await auth.state.keys.set({ "pre-key": {} });

    expect(calls).toEqual([]);
  });

  it("deletes without inserting when every key is removed", async () => {
    const auth = await freshAuth();

    await auth.state.keys.set({ session: { "a@s.whatsapp.net": null } });

    expect(calls.map((call) => call.op)).toEqual([
      "$transaction",
      "tx.deleteMany",
    ]);
    expect(tx.deviceAuthState.createMany).not.toHaveBeenCalled();
  });
});
