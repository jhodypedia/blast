import "server-only";

import { initAuthCreds } from "@rexxhayanasi/elaina-baileys";

import { prisma } from "@/lib/db/prisma";
import { decryptJson, encryptJson } from "@/lib/security/crypto";

/**
 * Prisma-backed Baileys auth state with encryption at rest (RULES.md §7, §20).
 *
 * Sessions are stored in the database rather than on disk so any worker replica
 * can resume a device without a shared volume. Every value is encrypted with
 * AES-256-GCM and is never logged.
 */

/** Baileys serialises Buffers via a `toJSON`/BufferJSON pair; replicate it here. */
type Serialized = unknown;

function replacer(_key: string, value: unknown): Serialized {
  if (value instanceof Uint8Array) {
    return { type: "Buffer", data: Buffer.from(value).toString("base64") };
  }
  if (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: string }).type === "Buffer" &&
    Array.isArray((value as { data?: unknown }).data)
  ) {
    return {
      type: "Buffer",
      data: Buffer.from((value as { data: number[] }).data).toString("base64"),
    };
  }
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: string }).type === "Buffer" &&
    typeof (value as { data?: unknown }).data === "string"
  ) {
    return Buffer.from((value as { data: string }).data, "base64");
  }
  return value;
}

function encode(value: unknown): string {
  return encryptJson(JSON.parse(JSON.stringify(value, replacer)));
}

function decode<T>(ciphertext: string): T {
  return JSON.parse(
    JSON.stringify(decryptJson<unknown>(ciphertext)),
    reviver,
  ) as T;
}

const CREDS_KEY = "creds";

function stateKey(type: string, id: string): string {
  return `${type}:${id}`;
}

export type BaileysAuthState = {
  state: {
    creds: unknown;
    keys: {
      get: (type: string, ids: string[]) => Promise<Record<string, unknown>>;
      set: (data: Record<string, Record<string, unknown>>) => Promise<void>;
    };
  };
  saveCreds: () => Promise<void>;
};

/**
 * Loads (or initialises) the encrypted auth state for a device.
 *
 * Named `loadAuthState` rather than the Baileys `useMultiFileAuthState`
 * convention so it is not mistaken for a React hook.
 *
 * Signal key writes are batched into a single `$transaction` so a partially
 * written key set can never be observed by a concurrent reconnect.
 */
export async function loadAuthState(
  deviceId: string,
): Promise<BaileysAuthState> {
  const existing = await prisma.deviceAuthState.findUnique({
    where: { deviceId_stateKey: { deviceId, stateKey: CREDS_KEY } },
    select: { ciphertext: true },
  });

  const creds: unknown = existing
    ? decode<unknown>(existing.ciphertext)
    : initAuthCreds();

  const saveCreds = async (): Promise<void> => {
    const ciphertext = encode(creds);
    await prisma.deviceAuthState.upsert({
      where: { deviceId_stateKey: { deviceId, stateKey: CREDS_KEY } },
      create: { deviceId, stateKey: CREDS_KEY, ciphertext },
      update: { ciphertext },
    });
  };

  if (!existing) {
    await saveCreds();
  }

  return {
    state: {
      creds,
      keys: {
        async get(type, ids) {
          if (ids.length === 0) {
            return {};
          }

          const rows = await prisma.deviceAuthState.findMany({
            where: {
              deviceId,
              stateKey: { in: ids.map((id) => stateKey(type, id)) },
            },
            select: { stateKey: true, ciphertext: true },
          });

          const result: Record<string, unknown> = {};
          for (const row of rows) {
            const id = row.stateKey.slice(type.length + 1);
            result[id] = decode<unknown>(row.ciphertext);
          }
          return result;
        },

        async set(data) {
          const operations: Array<{ key: string; ciphertext: string | null }> = [];

          for (const [type, entries] of Object.entries(data)) {
            for (const [id, value] of Object.entries(entries)) {
              operations.push({
                key: stateKey(type, id),
                ciphertext: value == null ? null : encode(value),
              });
            }
          }

          if (operations.length === 0) {
            return;
          }

          await prisma.$transaction(
            operations.map((operation) =>
              operation.ciphertext === null
                ? prisma.deviceAuthState.deleteMany({
                    where: { deviceId, stateKey: operation.key },
                  })
                : prisma.deviceAuthState.upsert({
                    where: {
                      deviceId_stateKey: { deviceId, stateKey: operation.key },
                    },
                    create: {
                      deviceId,
                      stateKey: operation.key,
                      ciphertext: operation.ciphertext,
                    },
                    update: { ciphertext: operation.ciphertext },
                  }),
            ),
          );
        },
      },
    },
    saveCreds,
  };
}

/** Permanently removes a device's stored session material. */
export async function clearAuthState(deviceId: string): Promise<void> {
  await prisma.deviceAuthState.deleteMany({ where: { deviceId } });
  await prisma.device.updateMany({
    where: { id: deviceId },
    data: { credentialsCiphertext: null },
  });
}
