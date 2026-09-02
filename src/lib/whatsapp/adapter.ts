import "server-only";

import { readFile } from "node:fs/promises";

import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@rexxhayanasi/elaina-baileys";

import { logger } from "@/lib/observability/logger";
import { clearAuthState, loadAuthState } from "@/lib/whatsapp/auth-state";
import { classifySendError } from "@/lib/whatsapp/errors";
import type {
  ConnectionUpdate,
  DeviceConnectionState,
  OutgoingMessage,
  PairingChallenge,
  PairingRequest,
  SendResult,
  WhatsAppAdapter,
} from "@/lib/whatsapp/types";

/**
 * The single Baileys integration point (RULES.md §8).
 *
 * Sockets live in this module's process-local registry. In production the worker
 * process owns them; the web process only reads device rows and enqueues session
 * jobs, so no long-lived socket is ever attached to a request lifecycle.
 */

type SocketHandle = {
  socket: ReturnType<typeof makeWASocket>;
  state: DeviceConnectionState;
};

const sockets = new Map<string, SocketHandle>();

/** Converts a canonical number to a WhatsApp JID. */
function toJid(normalizedNumber: string): string {
  return `${normalizedNumber}@s.whatsapp.net`;
}

const QR_TTL_MS = 60_000;
const PAIR_CODE_TTL_MS = 120_000;
/** Upper bound for a single send; beyond this the outcome is ambiguous. */
const SEND_TIMEOUT_MS = 45_000;

async function connect(params: {
  deviceId: string;
  pairing?: PairingRequest;
  onChallenge?: (challenge: PairingChallenge) => void | Promise<void>;
  onUpdate?: (update: ConnectionUpdate) => void | Promise<void>;
}): Promise<void> {
  const log = logger("device");
  const { deviceId } = params;

  if (sockets.has(deviceId)) {
    // Already connecting/connected in this process.
    return;
  }

  const auth = await loadAuthState(deviceId);
  const { version } = await fetchLatestBaileysVersion();

  const socket = makeWASocket({
    version,
    auth: auth.state,
    // Pair-code flows must not also print a QR.
    printQRInTerminal: false,
    browser: ["PBlast", "Chrome", "1.0.0"],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    logger: log as never,
  } as never);

  const handle: SocketHandle = { socket, state: "CONNECTING" };
  sockets.set(deviceId, handle);

  let pairCodeRequested = false;

  socket.ev.on("creds.update", () => {
    void auth.saveCreds();
  });

  socket.ev.on("connection.update", (update: unknown) => {
    void (async () => {
      const { connection, lastDisconnect, qr } = update as {
        connection?: string;
        lastDisconnect?: { error?: unknown };
        qr?: string;
      };

      if (qr && params.pairing?.method === "QR") {
        await params.onChallenge?.({
          method: "QR",
          qr,
          expiresAt: new Date(Date.now() + QR_TTL_MS),
        });
      }

      if (
        !pairCodeRequested &&
        params.pairing?.method === "PAIR_CODE" &&
        connection === "connecting"
      ) {
        pairCodeRequested = true;
        try {
          const pairCode = await socket.requestPairingCode(
            params.pairing.normalizedNumber,
            undefined,
          );
          await params.onChallenge?.({
            method: "PAIR_CODE",
            pairCode: String(pairCode),
            expiresAt: new Date(Date.now() + PAIR_CODE_TTL_MS),
          });
        } catch (error) {
          log.warn(
            { event: "device.pair_code_failed", deviceId },
            `Pair code request failed: ${
              error instanceof Error ? error.name : "unknown"
            }`,
          );
          handle.state = "ERROR";
          await params.onUpdate?.({
            deviceId,
            state: "ERROR",
            errorCode: "PAIR_CODE_FAILED",
          });
        }
      }

      if (connection === "open") {
        handle.state = "CONNECTED";
        const rawJid = socket.user?.id ?? "";
        const normalizedNumber = rawJid.split(":")[0]?.split("@")[0];

        await params.onUpdate?.({
          deviceId,
          state: "CONNECTED",
          ...(normalizedNumber ? { normalizedNumber } : {}),
        });
        return;
      }

      if (connection === "close") {
        const statusCode = (
          lastDisconnect?.error as
            | { output?: { statusCode?: number } }
            | undefined
        )?.output?.statusCode;

        const loggedOut = statusCode === DisconnectReason.loggedOut;
        handle.state = loggedOut ? "EXPIRED" : "DISCONNECTED";
        sockets.delete(deviceId);

        if (loggedOut) {
          // The session is unrecoverable; wipe stored credentials.
          await clearAuthState(deviceId);
        }

        await params.onUpdate?.({
          deviceId,
          state: handle.state,
          ...(statusCode ? { errorCode: `DISCONNECT_${statusCode}` } : {}),
          requiresReauth: loggedOut,
        });
      }
    })();
  });
}

async function disconnect(deviceId: string): Promise<void> {
  const handle = sockets.get(deviceId);
  if (!handle) {
    return;
  }
  sockets.delete(deviceId);
  try {
    handle.socket.end(undefined);
  } catch {
    // Closing an already-dead socket is not an error.
  }
}

async function logout(deviceId: string): Promise<void> {
  const handle = sockets.get(deviceId);
  sockets.delete(deviceId);

  if (handle) {
    try {
      // The distribution's typings require an explicit argument here.
      await (handle.socket.logout as (msg?: string) => Promise<void>)(
        "user requested logout",
      );
    } catch {
      // Best effort: the session is being discarded regardless.
    }
  }

  await clearAuthState(deviceId);
}

function getState(deviceId: string): DeviceConnectionState {
  return sockets.get(deviceId)?.state ?? "DISCONNECTED";
}

async function send(
  deviceId: string,
  message: OutgoingMessage,
): Promise<SendResult> {
  const handle = sockets.get(deviceId);

  if (!handle || handle.state !== "CONNECTED") {
    return {
      status: "RETRYABLE_FAILED",
      failureCategory: "DEVICE_NOT_CONNECTED",
      failureReason: "The selected device is not connected",
    };
  }

  const jid = toJid(message.normalizedNumber);

  // `writeAttempted` flips immediately before the provider call so a timeout
  // afterwards is treated as ambiguous rather than retryable (RULES.md §12).
  let writeAttempted = false;

  try {
    const content = message.media
      ? {
          image: await readFile(message.media.storagePath),
          mimetype: message.media.mimeType,
          caption: message.media.caption ?? message.text,
        }
      : { text: message.text };

    writeAttempted = true;

    const result = await Promise.race([
      handle.socket.sendMessage(jid, content as never),
      new Promise<never>((_resolve, reject) => {
        setTimeout(
          () => reject(new Error("Send timed out awaiting provider ack")),
          SEND_TIMEOUT_MS,
        );
      }),
    ]);

    const providerMessageId = (result as { key?: { id?: string } } | undefined)
      ?.key?.id;

    return {
      status: "SENT",
      ...(providerMessageId ? { providerMessageId } : {}),
    };
  } catch (error) {
    const classification = classifySendError(error, writeAttempted);
    return {
      status: classification.status,
      failureCategory: classification.category,
      failureReason: classification.reason,
    };
  }
}

async function isRegistered(
  deviceId: string,
  normalizedNumber: string,
): Promise<boolean | null> {
  const handle = sockets.get(deviceId);
  if (!handle || handle.state !== "CONNECTED") {
    return null;
  }

  try {
    const results = await handle.socket.onWhatsApp(normalizedNumber);
    const first = results?.[0] as { exists?: boolean } | undefined;
    return first?.exists ?? false;
  } catch {
    // Treated as "unknown" so callers do not skip a potentially valid recipient.
    return null;
  }
}

export const whatsappAdapter: WhatsAppAdapter = {
  connect,
  disconnect,
  logout,
  getState,
  send,
  isRegistered,
};
