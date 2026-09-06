import "server-only";

import { readFile } from "node:fs/promises";

import makeWASocket, {
  Button,
  Carousel,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@rexxhayanasi/elaina-baileys";

import { logger } from "@/lib/observability/logger";
import {
  SHADOW_BAN_ERROR_CODE,
  SHADOW_BAN_STATUS_CODES,
} from "@/lib/constants";
import { resolveStoragePath } from "@/lib/storage/private-storage";
import { clearAuthState, loadAuthState } from "@/lib/whatsapp/auth-state";
import { planContent, type ContentPlan } from "@/lib/whatsapp/content";
import { classifySendError } from "@/lib/whatsapp/errors";
import type {
  ConnectionUpdate,
  DeviceConnectionState,
  OutgoingButton,
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
  /** Set when `disconnect`/`logout` tore this handle down on purpose. */
  disposed: boolean;
};

/** The subset of the Baileys credential blob this adapter inspects. */
type StoredCreds = {
  /** Set only by the link-code (pair code) handshake. */
  registered?: boolean;
  /** Signed device identity; issued by both pairing flows on success. */
  account?: unknown;
  me?: { id?: string };
};

/**
 * True once WhatsApp has linked this session, by either pairing flow.
 *
 * `registered` is set by the link-code handshake only, so QR-paired sessions are
 * recognised through the signed device identity instead.
 */
function isLinked(creds: StoredCreds): boolean {
  return Boolean(creds.registered || creds.account);
}

const sockets = new Map<string, SocketHandle>();

/** Converts a canonical number to a WhatsApp JID. */
function toJid(normalizedNumber: string): string {
  return `${normalizedNumber}@s.whatsapp.net`;
}

const QR_TTL_MS = 60_000;
const PAIR_CODE_TTL_MS = 180_000;
/** Upper bound for a single send; beyond this the outcome is ambiguous. */
const SEND_TIMEOUT_MS = 45_000;
/**
 * WhatsApp closes the socket with `restartRequired` (515) as the final step of a
 * successful pairing, and occasionally mid-session. The credentials it just
 * issued are valid, so the only correct response is to rebuild the socket.
 * Bounded so a server that keeps demanding restarts cannot spin forever.
 */
const MAX_RESTART_ATTEMPTS = 3;
const RESTART_DELAY_MS = 1_000;

type SessionParams = {
  deviceId: string;
  pairing?: PairingRequest;
  onChallenge?: (challenge: PairingChallenge) => void | Promise<void>;
  onUpdate?: (update: ConnectionUpdate) => void | Promise<void>;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function connect(params: SessionParams): Promise<void> {
  const existing = sockets.get(params.deviceId);
  if (existing?.state === "CONNECTED") {
    return;
  }
  if (existing) {
    // Replace a stale handshake so a new pairing request gets fresh callbacks.
    await disconnect(params.deviceId);
  }

  await openSocket(params, 0);
}

/**
 * Builds one socket generation for a device.
 *
 * `restartAttempt` counts the 515 restarts already performed for this session.
 * `end()` destroys the Baileys event emitter, so a restart cannot reuse the old
 * socket: a brand new one is created from the persisted credentials, which makes
 * `validateConnection` take the login path instead of registering again.
 */
async function openSocket(
  params: SessionParams,
  restartAttempt: number,
): Promise<void> {
  const log = logger("device");
  const { deviceId } = params;

  let auth = await loadAuthState(deviceId);
  // A linked session logs straight back in; requesting a pair code on it would
  // overwrite the identity WhatsApp issued and invalidate the session.
  let credsLinked = isLinked(auth.state.creds as StoredCreds);

  // `requestPairingCode` writes `creds.me` before the request reaches the
  // server, so an attempt that failed mid-flight leaves an identified but
  // unlinked session. Baileys would then take the login path and WhatsApp
  // answers with a stream failure, so that dead identity is discarded first.
  if (
    params.pairing &&
    restartAttempt === 0 &&
    !credsLinked &&
    (auth.state.creds as StoredCreds).me?.id
  ) {
    log.warn(
      { event: "device.pairing_state_reset", deviceId },
      "Discarding an unlinked WhatsApp session before pairing again",
    );
    await clearAuthState(deviceId);
    auth = await loadAuthState(deviceId);
    credsLinked = isLinked(auth.state.creds as StoredCreds);
  }

  const { version } = await fetchLatestBaileysVersion();

  const socket = makeWASocket({
    version,
    auth: auth.state,
    // Pair-code flows must not also print a QR.
    printQRInTerminal: false,
    browser: ["PBlast", "Chrome", "1.0.0"],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    // Keeps the library's QR rotation aligned with the TTL we advertise.
    qrTimeout: QR_TTL_MS,
    logger: log as never,
  } as never);

  const handle: SocketHandle = { socket, state: "CONNECTING", disposed: false };
  sockets.set(deviceId, handle);
  
 log.info(
  {
    event: "device.connect.starting",
    deviceId,
    hasPairing: !!params.pairing,
    pairingMethod: params.pairing?.method ?? "unknown",
  },
  "Starting device connection",
);


  // Credential writes are serialised instead of fire-and-forget: the post-pair
  // restart has to observe the credentials issued moments earlier, otherwise it
  // reloads a pre-pairing snapshot and starts the handshake all over again.
  let credsWrite: Promise<void> = Promise.resolve();
  const persistCreds = (): Promise<void> => {
    credsWrite = credsWrite
      .then(() => auth.saveCreds())
      .catch(() => {
        log.error(
          { event: "device.creds_persist_failed", deviceId },
          "Failed to persist WhatsApp credentials",
        );
      });
    return credsWrite;
  };

  let pairCodeRequested = false;

  socket.ev.on("creds.update", () => {
    void persistCreds();
  });

  socket.ev.on("connection.update", (update: unknown) => {
    void (async () => {
      // A newer generation already owns this device: ignore the dead socket's
      // trailing events so they cannot overwrite the live state.
      if (sockets.get(deviceId) !== handle) {
        log.info(
          { event: "device.connection.update.stale", deviceId },
          "Ignoring stale connection update from older socket generation",
        );
        return;
      }

      const { connection, lastDisconnect, qr, isNewLogin } = update as {
        connection?: string;
        lastDisconnect?: { error?: unknown };
        qr?: string;
        isNewLogin?: boolean;
      };

      log.info(
        { 
          event: "device.connection.update.received", 
          deviceId,
          connection,
          hasQr: !!qr,
          isNewLogin,
        },
        "Connection update received",
      );

      // QR refs are pushed by WhatsApp for every unregistered handshake, pair
      // code flows included. Surfacing one there would replace the code the user
      // is waiting for, so a QR is only forwarded when it is what is expected.
      if (qr && (!params.pairing || params.pairing.method === "QR")) {
        log.info(
          { event: "device.qr.received", deviceId },
          "Received QR code from WhatsApp",
        );
        await params.onChallenge?.({
          method: "QR",
          qr,
          expiresAt: new Date(Date.now() + QR_TTL_MS),
        });
        log.info(
          { event: "device.challenge.stored", deviceId, method: "QR" },
          "QR challenge stored in Redis",
        );
      }

      if (isNewLogin) {
        // The device is linked and the challenge is spent. WhatsApp will now
        // close the socket with 515; keep the session marked as in progress.
        await persistCreds();
        await params.onUpdate?.({
          deviceId,
          state: "CONNECTING",
          errorCode: "PAIRED",
          restarting: true,
        });
      }

      // The link-code request is a binary node, so it can only be sent once the
      // Noise handshake is established. For PAIR_CODE method, we request as soon
      // as WhatsApp pushes pairing refs (QR or initial connection event), not
      // dependent on QR availability being displayed to users.
      // Hold the pairing request in a local const so TypeScript keeps the
      // PAIR_CODE narrowing through the logging and the request call below.
      const pairingRequest = params.pairing;
      const pairCodeReady =
        !pairCodeRequested &&
        pairingRequest?.method === "PAIR_CODE" &&
        restartAttempt === 0 &&
        !credsLinked &&
        (qr || connection === "open");

      log.info(
        {
          event: "device.pair_code.condition_check",
          deviceId,
          pairCodeReady,
          pairCodeRequested,
          hasPairingMethod: !!pairingRequest,
          pairingMethod: pairingRequest?.method,
          restartAttempt,
          credsLinked,
          qrAvailable: !!qr,
          connectionState: connection,
        },
        "Pair code ready check result",
      );

      if (pairCodeReady) {
        // Explicit type guard for PAIR_CODE variant
        if (pairingRequest && pairingRequest.method === "PAIR_CODE") {
          try {
            const pairCode = await socket.requestPairingCode(
              pairingRequest.normalizedNumber,
              pairingRequest.customCode,
            );
            log.info(
              { event: "device.pair_code.success", deviceId, pairCode },
              "Pairing code generated successfully",
            );
            await params.onChallenge?.({
              method: "PAIR_CODE",
              pairCode: String(pairCode),
              expiresAt: new Date(Date.now() + PAIR_CODE_TTL_MS),
            });
          } catch (error) {
            log.warn(
              { event: "device.pair_code.failed", deviceId, error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined },
              `Pair code request failed`,
            );

            // The request identifies the session before it leaves, so a failure
            // leaves credentials that log in as an unregistered companion and get
            // rejected by WhatsApp. Tear the attempt down completely.
            handle.state = "ERROR";
            handle.disposed = true;
            sockets.delete(deviceId);
            try {
              socket.end(undefined);
            } catch {
              // Closing an already-dead socket is not an error.
            }
            await credsWrite;
            await clearAuthState(deviceId);

            await params.onUpdate?.({
              deviceId,
              state: "ERROR",
              errorCode: "PAIR_CODE_FAILED",
            });
            return;
          }
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

        if (handle.disposed) {
          // Deliberate teardown; the caller already owns the resulting state.
          return;
        }

        const restartRequired = statusCode === DisconnectReason.restartRequired;
        if (restartRequired && restartAttempt < MAX_RESTART_ATTEMPTS) {
          // Mandatory post-pairing restart. Report progress instead of a
          // disconnect so the pairing challenge and its lock are preserved.
          sockets.delete(deviceId);
          await params.onUpdate?.({
            deviceId,
            state: "CONNECTING",
            errorCode: "RESTART_REQUIRED",
            restarting: true,
          });

          log.info(
            { event: "device.restart_required", deviceId, attempt: restartAttempt + 1 },
            "Rebuilding WhatsApp socket after a restart-required close",
          );

          // The credentials issued during pairing must be on disk before the
          // replacement socket reads them back.
          await credsWrite;
          await delay(RESTART_DELAY_MS);

          if (sockets.has(deviceId)) {
            // Something else claimed the device while we waited.
            return;
          }

          try {
            await openSocket(params, restartAttempt + 1);
          } catch (error) {
            log.error(
              { event: "device.restart_failed", deviceId },
              `Socket restart failed: ${
                error instanceof Error ? error.name : "unknown"
              }`,
            );
            await params.onUpdate?.({
              deviceId,
              state: "ERROR",
              errorCode: "RESTART_FAILED",
            });
          }
          return;
        }

        const loggedOut = statusCode === DisconnectReason.loggedOut;
        // WhatsApp answers a restricted number with `forbidden`, while an ordinary
        // unlink arrives as `loggedOut`. Only the former is reported as a
        // restriction, so a routine disconnect is never mislabelled (RULES.md §8).
        const restricted =
          !loggedOut &&
          statusCode !== undefined &&
          (SHADOW_BAN_STATUS_CODES as readonly number[]).includes(statusCode);

        handle.state = loggedOut
          ? "EXPIRED"
          : restricted
            ? "ERROR"
            : "DISCONNECTED";
        sockets.delete(deviceId);

        if (loggedOut || restricted) {
          // The session is unrecoverable; wipe stored credentials.
          await clearAuthState(deviceId);
        }

        if (restricted) {
          log.warn(
            { event: "device.restricted", deviceId, statusCode },
            "WhatsApp refused the session; credentials cleared",
          );
        }

        await params.onUpdate?.({
          deviceId,
          state: handle.state,
          ...(restartRequired
            ? { errorCode: "RESTART_EXHAUSTED" }
            : restricted
              ? { errorCode: SHADOW_BAN_ERROR_CODE }
              : statusCode
                ? { errorCode: `DISCONNECT_${statusCode}` }
                : {}),
          requiresReauth: loggedOut || restricted,
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
  handle.disposed = true;
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
    handle.disposed = true;
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

/**
 * Renders one content plan into a Baileys send.
 *
 * `Button`/`Carousel` need the socket, and every image is read from private
 * storage here — this is the only layer allowed to resolve a storage key — so the
 * plan itself stays free of both concerns. Returns a thunk instead of content
 * because a carousel is relayed rather than sent through `sendMessage`.
 */
async function renderPlan(
  handle: SocketHandle,
  jid: string,
  plan: ContentPlan,
): Promise<() => Promise<unknown>> {
  const read = (image: { storageKey: string }) =>
    readFile(resolveStoragePath(image.storageKey));

  switch (plan.kind) {
    case "TEXT": {
      const content = { text: plan.text };
      return () => handle.socket.sendMessage(jid, content as never);
    }

    case "IMAGE": {
      const content = {
        image: await read(plan.image),
        mimetype: plan.image.mimeType,
        caption: plan.text,
      };
      return () => handle.socket.sendMessage(jid, content as never);
    }

    case "BUTTONS": {
      const builder = new Button(handle.socket).setBody(plan.text);
      if (plan.image) {
        builder.setImage(await read(plan.image));
      }
      applyButtons(builder, plan.buttons);
      const message = await builder.build(jid);
      return () => relay(handle, message);
    }

    case "CAROUSEL": {
      const carousel = new Carousel(handle.socket).setBody(plan.text);
      for (const card of plan.cards) {
        const builder = new Button(handle.socket)
          .setBody(plan.text)
          .setImage(await read(card.image));
        applyButtons(builder, card.buttons);
        carousel.addCard(await builder.toCard());
      }
      const message = await carousel.build(jid);
      return () => relay(handle, message);
    }
  }
}

/** Adds the block's buttons to an interactive builder, in configured order. */
function applyButtons(builder: Button, buttons: OutgoingButton[]): void {
  for (const [index, button] of buttons.entries()) {
    switch (button.variant) {
      case "URL":
        builder.addUrl(button.label, button.value ?? "");
        break;
      case "REPLY":
        // A stable, non-sensitive payload id so an inbound reply is attributable.
        builder.addReply(button.label, `reply_${index + 1}`);
        break;
      case "COPY":
        builder.addCopy(button.label, button.value ?? "");
        break;
      case "CALL":
        builder.addCall(button.label, button.value ?? "");
        break;
    }
  }
}

/**
 * Relays a pre-built interactive message.
 *
 * `generateWAMessageFromContent` output cannot go through `sendMessage`; the
 * native-flow node below is what makes WhatsApp render the buttons/carousel.
 */
async function relay(
  handle: SocketHandle,
  message: { key: { remoteJid?: string | null; id?: string | null }; message: unknown },
): Promise<{ key?: { id?: string } }> {
  await (
    handle.socket as unknown as {
      relayMessage: (
        jid: string,
        content: unknown,
        options: Record<string, unknown>,
      ) => Promise<void>;
    }
  ).relayMessage(message.key.remoteJid ?? "", message.message, {
    messageId: message.key.id,
    additionalNodes: [
      {
        tag: "biz",
        attrs: {},
        content: [
          {
            tag: "interactive",
            attrs: { type: "native_flow", v: "1" },
            content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }],
          },
        ],
      },
    ],
  });

  return message as { key?: { id?: string } };
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
    // The whole content block becomes exactly one send, whichever shape it needs.
    const dispatch = await renderPlan(handle, jid, planContent(message));

    writeAttempted = true;

    const result = await Promise.race([
      dispatch(),
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
