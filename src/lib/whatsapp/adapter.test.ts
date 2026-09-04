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

  emit(event: string, payload: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(payload);
    }
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

vi.mock("@rexxhayanasi/elaina-baileys", () => ({
  default: () => {
    const socket = new FakeSocket();
    createdSockets.push(socket);
    return socket;
  },
  Button: class {},
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
