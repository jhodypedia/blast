import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ConnectionUpdate, PairingChallenge } from "@/lib/whatsapp/types";

/**
 * Post-pairing restart contract (status 515).
 *
 * WhatsApp finishes a successful link by closing the socket with
 * `restartRequired`. Baileys' `end()` destroys the event emitter, so the only
 * valid response is to build a brand new socket from the credentials that were
 * just issued. These fakes make that generation boundary observable.
 */

type Handler = (payload: unknown) => void;

class FakeSocket {
  readonly handlers = new Map<string, Handler[]>();

  readonly ev = {
    on: (event: string, handler: Handler): void => {
      const existing = this.handlers.get(event) ?? [];
      existing.push(handler);
      this.handlers.set(event, existing);
    },
  };

  user: { id: string } | undefined = { id: "628111222333:12@s.whatsapp.net" };

  end = vi.fn();

  logout = vi.fn(async () => {});

  requestPairingCode = vi.fn(async () => "AB12CD34");

  sendMessage = vi.fn(async (_jid: string, content: unknown) => {
    sendLog.push({ kind: "sendMessage", content });
    return { key: { id: "provider-message-id" } };
  });

  relayMessage = vi.fn(
    async (_jid: string, content: unknown, _options: unknown) => {
      sendLog.push({ kind: "relayMessage", content });
    },
  );

  emit(event: string, payload: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(payload);
    }
  }
}

/** Records what the adapter handed to the provider for each send. */
const sendLog: Array<{ kind: string; content: unknown }> = [];
/** Records the builder calls the adapter made while rendering a content plan. */
const builderLog: string[] = [];

/**
 * Minimal stand-ins for the library's interactive builders.
 *
 * They record the calls the adapter makes and return a message envelope shaped
 * like `generateWAMessageFromContent` output, which is what `relayMessage`
 * consumes.
 */
class FakeButton {
  readonly buttons: string[] = [];
  body = "";
  image: Buffer | undefined;

  setBody(body: string): this {
    this.body = body;
    return this;
  }

  setImage(image: Buffer): this {
    this.image = image;
    builderLog.push("button.setImage");
    return this;
  }

  addUrl(label: string, url: string): this {
    this.buttons.push(`url:${label}:${url}`);
    return this;
  }

  addReply(label: string, id: string): this {
    this.buttons.push(`reply:${label}:${id}`);
    return this;
  }

  addCopy(label: string, code: string): this {
    this.buttons.push(`copy:${label}:${code}`);
    return this;
  }

  addCall(label: string, number: string): this {
    this.buttons.push(`call:${label}:${number}`);
    return this;
  }

  async toCard(): Promise<unknown> {
    builderLog.push("button.toCard");
    return { body: this.body, buttons: [...this.buttons], hasImage: Boolean(this.image) };
  }

  async build(jid: string): Promise<unknown> {
    builderLog.push("button.build");
    return {
      key: { remoteJid: jid, id: "interactive-message-id" },
      message: {
        interactive: {
          body: this.body,
          buttons: [...this.buttons],
          hasImage: Boolean(this.image),
        },
      },
    };
  }
}

class FakeCarousel {
  readonly cards: unknown[] = [];
  body = "";

  setBody(body: string): this {
    this.body = body;
    return this;
  }

  addCard(card: unknown): this {
    this.cards.push(card);
    builderLog.push("carousel.addCard");
    return this;
  }

  build(jid: string): unknown {
    builderLog.push("carousel.build");
    return {
      key: { remoteJid: jid, id: "carousel-message-id" },
      message: { carousel: { body: this.body, cards: [...this.cards] } },
    };
  }
}

const createdSockets: FakeSocket[] = [];
const callLog: string[] = [];
let credsFixture: Record<string, unknown> = {};

const saveCreds = vi.fn(async () => {
  callLog.push("saveCreds");
});

const loadAuthState = vi.fn(async () => {
  callLog.push("loadAuthState");
  return { state: { creds: credsFixture, keys: {} }, saveCreds };
});

const clearAuthState = vi.fn(async () => {
  callLog.push("clearAuthState");
});

vi.mock("@/lib/whatsapp/auth-state", () => ({ loadAuthState, clearAuthState }));

/** The adapter is the only layer allowed to touch private storage. */
const readFile = vi.fn(async (path: string) => Buffer.from(`bytes:${path}`));

vi.mock("node:fs/promises", () => ({ readFile }));

vi.mock("@/lib/storage/private-storage", () => ({
  resolveStoragePath: (key: string) => `/storage/${key}`,
}));

vi.mock("@rexxhayanasi/elaina-baileys", () => ({
  default: () => {
    const socket = new FakeSocket();
    createdSockets.push(socket);
    return socket;
  },
  Button: FakeButton,
  Carousel: FakeCarousel,
  DisconnectReason: {
    restartRequired: 515,
    loggedOut: 401,
    connectionClosed: 428,
  },
  fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 0] }),
}));

/** Mirrors the adapter's private constants. */
const RESTART_DELAY_MS = 1_000;
const MAX_RESTART_ATTEMPTS = 3;

function recorder() {
  const updates: ConnectionUpdate[] = [];
  const challenges: PairingChallenge[] = [];
  return {
    updates,
    challenges,
    onUpdate: async (update: ConnectionUpdate) => {
      updates.push(update);
    },
    onChallenge: async (challenge: PairingChallenge) => {
      challenges.push(challenge);
    },
  };
}

function socketAt(index: number): FakeSocket {
  const socket = createdSockets[index];
  if (!socket) {
    throw new Error(`No socket was created at generation ${index}`);
  }
  return socket;
}

function closeWith(socket: FakeSocket, statusCode: number): void {
  socket.emit("connection.update", {
    connection: "close",
    lastDisconnect: { error: { output: { statusCode } } },
  });
}

/** Lets the adapter's async handlers and its restart delay run to completion. */
async function settle(ms = RESTART_DELAY_MS + 50): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

let adapter: typeof import("@/lib/whatsapp/adapter");
let deviceCounter = 0;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  createdSockets.length = 0;
  callLog.length = 0;
  sendLog.length = 0;
  builderLog.length = 0;
  credsFixture = {};
  deviceCounter += 1;
  // A fresh module gives each test its own socket registry.
  vi.resetModules();
  adapter = await import("@/lib/whatsapp/adapter");
});

function nextDeviceId(): string {
  return `device-${deviceCounter}`;
}

describe("whatsappAdapter restart handling", () => {
  it("rebuilds the socket instead of reporting a disconnect on 515", async () => {
    const deviceId = nextDeviceId();
    const events = recorder();

    await adapter.whatsappAdapter.connect({
      deviceId,
      onUpdate: events.onUpdate,
      onChallenge: events.onChallenge,
    });
    expect(createdSockets).toHaveLength(1);

    closeWith(socketAt(0), 515);
    await settle();

    expect(createdSockets).toHaveLength(2);
    expect(events.updates).toEqual([
      {
        deviceId,
        state: "CONNECTING",
        errorCode: "RESTART_REQUIRED",
        restarting: true,
      },
    ]);
    expect(
      events.updates.some((update) => update.state === "DISCONNECTED"),
    ).toBe(false);
  });

  it("flags the pairing as still in progress on isNewLogin", async () => {
    const deviceId = nextDeviceId();
    const events = recorder();

    await adapter.whatsappAdapter.connect({
      deviceId,
      onUpdate: events.onUpdate,
      onChallenge: events.onChallenge,
    });

    socketAt(0).emit("connection.update", { isNewLogin: true });
    await settle(0);

    expect(events.updates).toEqual([
      { deviceId, state: "CONNECTING", errorCode: "PAIRED", restarting: true },
    ]);
  });

  it("persists the freshly issued credentials before reloading them", async () => {
    const deviceId = nextDeviceId();
    const events = recorder();

    await adapter.whatsappAdapter.connect({
      deviceId,
      onUpdate: events.onUpdate,
    });

    socketAt(0).emit("creds.update", {});
    socketAt(0).emit("connection.update", { isNewLogin: true });
    await settle(0);
    closeWith(socketAt(0), 515);
    await settle();

    // The replacement socket must not read a pre-pairing snapshot.
    const lastSave = callLog.lastIndexOf("saveCreds");
    const secondLoad = callLog.indexOf(
      "loadAuthState",
      callLog.indexOf("loadAuthState") + 1,
    );
    expect(lastSave).toBeGreaterThan(-1);
    expect(secondLoad).toBeGreaterThan(lastSave);
  });

  it("ignores trailing events from a superseded socket", async () => {
    const deviceId = nextDeviceId();
    const events = recorder();

    await adapter.whatsappAdapter.connect({
      deviceId,
      onUpdate: events.onUpdate,
    });

    closeWith(socketAt(0), 515);
    await settle();

    socketAt(0).emit("connection.update", { connection: "open" });
    await settle(0);

    expect(events.updates.some((update) => update.state === "CONNECTED")).toBe(
      false,
    );
  });

  it("gives up after the restart budget is exhausted", async () => {
    const deviceId = nextDeviceId();
    const events = recorder();

    await adapter.whatsappAdapter.connect({
      deviceId,
      onUpdate: events.onUpdate,
    });

    for (let attempt = 0; attempt <= MAX_RESTART_ATTEMPTS; attempt += 1) {
      closeWith(socketAt(attempt), 515);
      await settle();
    }

    expect(createdSockets).toHaveLength(MAX_RESTART_ATTEMPTS + 1);
    expect(events.updates.at(-1)).toEqual({
      deviceId,
      state: "DISCONNECTED",
      errorCode: "RESTART_EXHAUSTED",
      requiresReauth: false,
    });
    expect(clearAuthState).not.toHaveBeenCalled();
  });

  it("clears stored credentials when the session is logged out", async () => {
    const deviceId = nextDeviceId();
    const events = recorder();

    await adapter.whatsappAdapter.connect({
      deviceId,
      onUpdate: events.onUpdate,
    });

    closeWith(socketAt(0), 401);
    await settle();

    expect(createdSockets).toHaveLength(1);
    expect(clearAuthState).toHaveBeenCalledWith(deviceId);
    expect(events.updates.at(-1)).toEqual({
      deviceId,
      state: "EXPIRED",
      errorCode: "DISCONNECT_401",
      requiresReauth: true,
    });
  });

  it("does not restart after a deliberate disconnect", async () => {
    const deviceId = nextDeviceId();
    const events = recorder();

    await adapter.whatsappAdapter.connect({
      deviceId,
      onUpdate: events.onUpdate,
    });

    await adapter.whatsappAdapter.disconnect(deviceId);
    closeWith(socketAt(0), 515);
    await settle();

    expect(createdSockets).toHaveLength(1);
    expect(events.updates).toHaveLength(0);
  });

  it("reports a forbidden close as a restriction and wipes the session", async () => {
    const deviceId = nextDeviceId();
    const events = recorder();

    await adapter.whatsappAdapter.connect({
      deviceId,
      onUpdate: events.onUpdate,
    });

    closeWith(socketAt(0), 403);
    await settle();

    // A restricted number must never be reconnected automatically, so the
    // credentials go and the caller is told to stop (RULES.md §8).
    expect(createdSockets).toHaveLength(1);
    expect(clearAuthState).toHaveBeenCalledWith(deviceId);
    expect(events.updates.at(-1)).toEqual({
      deviceId,
      state: "ERROR",
      errorCode: "SHADOW_BAN",
      requiresReauth: true,
    });
  });

  it("does not label an ordinary transport close as a restriction", async () => {
    const deviceId = nextDeviceId();
    const events = recorder();

    await adapter.whatsappAdapter.connect({
      deviceId,
      onUpdate: events.onUpdate,
    });

    closeWith(socketAt(0), 428);
    await settle();

    expect(clearAuthState).not.toHaveBeenCalled();
    expect(events.updates.at(-1)).toEqual({
      deviceId,
      state: "DISCONNECTED",
      errorCode: "DISCONNECT_428",
      requiresReauth: false,
    });
  });
});

describe("whatsappAdapter pairing challenges", () => {
  it("requests a pairing code once per session, never after a restart", async () => {
    const deviceId = nextDeviceId();
    const events = recorder();

    await adapter.whatsappAdapter.connect({
      deviceId,
      pairing: { method: "PAIR_CODE", normalizedNumber: "628111222333" },
      onUpdate: events.onUpdate,
      onChallenge: events.onChallenge,
    });

    // The pairing refs prove the Noise transport is up; a link-code request
    // sent any earlier cannot reach the server.
    socketAt(0).emit("connection.update", { qr: "ref-string" });
    await settle(0);

    expect(socketAt(0).requestPairingCode).toHaveBeenCalledTimes(1);
    expect(events.challenges).toHaveLength(1);
    expect(events.challenges[0]).toMatchObject({
      method: "PAIR_CODE",
      pairCode: "AB12CD34",
    });

    socketAt(0).emit("connection.update", { qr: "ref-string-2" });
    await settle(0);
    expect(socketAt(0).requestPairingCode).toHaveBeenCalledTimes(1);

    closeWith(socketAt(0), 515);
    await settle();

    socketAt(1).emit("connection.update", { qr: "ref-string" });
    await settle(0);

    // Re-requesting a code on paired credentials would invalidate the session.
    expect(socketAt(1).requestPairingCode).not.toHaveBeenCalled();
  });

  it("does not request a pairing code before the transport is ready", async () => {
    const deviceId = nextDeviceId();
    const events = recorder();

    await adapter.whatsappAdapter.connect({
      deviceId,
      pairing: { method: "PAIR_CODE", normalizedNumber: "628111222333" },
      onUpdate: events.onUpdate,
      onChallenge: events.onChallenge,
    });

    // Baileys emits this a tick after construction, before the socket is open.
    socketAt(0).emit("connection.update", { connection: "connecting" });
    await settle(0);

    expect(socketAt(0).requestPairingCode).not.toHaveBeenCalled();
    expect(events.challenges).toHaveLength(0);
  });

  it("discards the half-written session when the pair code request fails", async () => {
    const deviceId = nextDeviceId();
    const events = recorder();

    await adapter.whatsappAdapter.connect({
      deviceId,
      pairing: { method: "PAIR_CODE", normalizedNumber: "628111222333" },
      onUpdate: events.onUpdate,
      onChallenge: events.onChallenge,
    });

    socketAt(0).requestPairingCode.mockRejectedValueOnce(
      new Error("Connection Closed"),
    );
    socketAt(0).emit("connection.update", { qr: "ref-string" });
    await settle(0);

    expect(events.challenges).toHaveLength(0);
    expect(events.updates).toEqual([
      { deviceId, state: "ERROR", errorCode: "PAIR_CODE_FAILED" },
    ]);
    // `requestPairingCode` sets `creds.me` before it sends, so the leftover
    // credentials would log in as an unregistered companion and be rejected.
    expect(clearAuthState).toHaveBeenCalledWith(deviceId);
    expect(socketAt(0).end).toHaveBeenCalled();

    // The dead generation must not be able to report a later login.
    socketAt(0).emit("connection.update", { connection: "open" });
    await settle(0);
    expect(events.updates).toHaveLength(1);
  });

  it("resets an unregistered session before requesting a new pair code", async () => {
    const deviceId = nextDeviceId();
    const events = recorder();
    credsFixture = { registered: false, me: { id: "628111222333@s.whatsapp.net" } };

    await adapter.whatsappAdapter.connect({
      deviceId,
      pairing: { method: "PAIR_CODE", normalizedNumber: "628111222333" },
      onUpdate: events.onUpdate,
      onChallenge: events.onChallenge,
    });

    expect(clearAuthState).toHaveBeenCalledWith(deviceId);
    expect(loadAuthState).toHaveBeenCalledTimes(2);
  });

  it("skips the pairing code when the credentials are already registered", async () => {
    const deviceId = nextDeviceId();
    const events = recorder();
    credsFixture = { registered: true };

    await adapter.whatsappAdapter.connect({
      deviceId,
      pairing: { method: "PAIR_CODE", normalizedNumber: "628111222333" },
      onUpdate: events.onUpdate,
      onChallenge: events.onChallenge,
    });

    socketAt(0).emit("connection.update", { qr: "ref-string" });
    await settle(0);

    expect(socketAt(0).requestPairingCode).not.toHaveBeenCalled();
    expect(events.challenges).toHaveLength(0);
  });

  it("does not surface a QR challenge during a pairing code flow", async () => {
    const deviceId = nextDeviceId();
    const events = recorder();

    await adapter.whatsappAdapter.connect({
      deviceId,
      pairing: { method: "PAIR_CODE", normalizedNumber: "628111222333" },
      onUpdate: events.onUpdate,
      onChallenge: events.onChallenge,
    });

    socketAt(0).emit("connection.update", { qr: "ref-string" });
    await settle(0);

    expect(
      events.challenges.some((challenge) => challenge.method === "QR"),
    ).toBe(false);
  });

  it("forwards a QR on a silent reconnect that has no pairing request", async () => {
    const deviceId = nextDeviceId();
    const events = recorder();

    await adapter.whatsappAdapter.connect({
      deviceId,
      onUpdate: events.onUpdate,
      onChallenge: events.onChallenge,
    });

    socketAt(0).emit("connection.update", { qr: "ref-string" });
    await settle(0);

    expect(events.challenges).toHaveLength(1);
    expect(events.challenges[0]).toMatchObject({
      method: "QR",
      qr: "ref-string",
    });
  });
});

/**
 * Content-block delivery.
 *
 * One content block must always leave as exactly one message, so these tests
 * assert both the provider call the adapter chose and that it made only one.
 */
describe("whatsappAdapter send", () => {
  /** Connects a device and drives it to CONNECTED. */
  async function connected(): Promise<string> {
    const deviceId = nextDeviceId();
    await adapter.whatsappAdapter.connect({ deviceId });
    socketAt(0).emit("connection.update", { connection: "open" });
    await settle(0);
    return deviceId;
  }

  const image = (name: string) => ({
    storageKey: `campaign-media/2026-01-01/${name}.png`,
    mimeType: "image/png",
  });

  it("refuses to send through a device that is not connected", async () => {
    const deviceId = nextDeviceId();

    const result = await adapter.whatsappAdapter.send(deviceId, {
      normalizedNumber: "628111222333",
      text: "Hello",
    });

    expect(result).toEqual({
      status: "RETRYABLE_FAILED",
      failureCategory: "DEVICE_NOT_CONNECTED",
      failureReason: "The selected device is not connected",
    });
    expect(sendLog).toHaveLength(0);
  });

  it("sends a text-only block as one plain message", async () => {
    const deviceId = await connected();

    const result = await adapter.whatsappAdapter.send(deviceId, {
      normalizedNumber: "628111222333",
      text: "Hello",
    });

    expect(result.status).toBe("SENT");
    expect(result.providerMessageId).toBe("provider-message-id");
    expect(sendLog).toEqual([
      { kind: "sendMessage", content: { text: "Hello" } },
    ]);
  });

  it("sends one image with no buttons as a single image message", async () => {
    const deviceId = await connected();

    const result = await adapter.whatsappAdapter.send(deviceId, {
      normalizedNumber: "628111222333",
      text: "Caption",
      images: [image("one")],
    });

    expect(result.status).toBe("SENT");
    expect(sendLog).toHaveLength(1);
    expect(sendLog[0]?.kind).toBe("sendMessage");
    expect(sendLog[0]?.content).toMatchObject({
      mimetype: "image/png",
      caption: "Caption",
    });
    // The key is resolved through private storage, never used as a raw path.
    expect(readFile).toHaveBeenCalledWith(
      `/storage/${image("one").storageKey}`,
    );
  });

  it("relays one image plus buttons as a single interactive message", async () => {
    const deviceId = await connected();

    const result = await adapter.whatsappAdapter.send(deviceId, {
      normalizedNumber: "628111222333",
      text: "Body",
      images: [image("one")],
      buttons: [
        { variant: "URL", label: "Buka", value: "https://example.com" },
        { variant: "REPLY", label: "Balas" },
      ],
    });

    expect(result.status).toBe("SENT");
    expect(sendLog).toHaveLength(1);
    expect(sendLog[0]?.kind).toBe("relayMessage");
    expect(sendLog[0]?.content).toEqual({
      interactive: {
        body: "Body",
        buttons: ["url:Buka:https://example.com", "reply:Balas:reply_2"],
        hasImage: true,
      },
    });
    expect(builderLog).toContain("button.setImage");
  });

  it("relays two images as a single two-card carousel", async () => {
    const deviceId = await connected();

    const result = await adapter.whatsappAdapter.send(deviceId, {
      normalizedNumber: "628111222333",
      text: "Body",
      images: [image("one"), image("two")],
      buttons: [{ variant: "COPY", label: "Salin", value: "PROMO" }],
    });

    expect(result.status).toBe("SENT");
    expect(sendLog).toHaveLength(1);
    expect(sendLog[0]?.kind).toBe("relayMessage");
    expect(builderLog.filter((entry) => entry === "carousel.addCard")).toHaveLength(2);
    expect(readFile).toHaveBeenCalledTimes(2);
  });

  it("classifies a provider failure without throwing", async () => {
    const deviceId = await connected();
    socketAt(0).sendMessage.mockRejectedValueOnce(new Error("Connection Closed"));

    const result = await adapter.whatsappAdapter.send(deviceId, {
      normalizedNumber: "628111222333",
      text: "Hello",
    });

    // The write had already been attempted, so the outcome is ambiguous rather
    // than retryable (RULES.md §12).
    expect(result.status).toBe("UNKNOWN");
    expect(result.failureCategory).toBe("CONNECTION_LOST_AFTER_WRITE");
  });
});
