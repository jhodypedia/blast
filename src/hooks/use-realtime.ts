"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { RealtimeEvent } from "@/lib/realtime/types";

/**
 * React hook for subscribing to realtime events via Socket.IO.
 *
 * Usage:
 * ```tsx
 * useRealtime("blast-job:abc123", (event) => {
 *   if (event.type === "blast-job:progress") {
 *     // update UI
 *   }
 * });
 * ```
 *
 * The hook automatically connects/disconnects and cleans up on unmount.
 * The Socket.IO connection is shared across all hook instances via a
 * module-level singleton.
 */

type EventHandler = (event: RealtimeEvent) => void;

// ── Socket.IO client singleton ─────────────────────────────────────────────

type SocketInstance = Awaited<ReturnType<typeof import("socket.io-client").io>>;

let socketPromise: Promise<SocketInstance> | null = null;
let connectedState = false;
const connectionListeners = new Set<() => void>();

function notifyConnectionListeners() {
  connectionListeners.forEach((fn) => fn());
}

async function getSocket(): Promise<SocketInstance> {
  if (socketPromise) return socketPromise;

  socketPromise = import("socket.io-client").then(({ io }) => {
    const socket = io(window.location.origin, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
    });

    socket.on("connect", () => {
      connectedState = true;
      notifyConnectionListeners();
    });

    socket.on("disconnect", () => {
      connectedState = false;
      notifyConnectionListeners();
    });

    return socket;
  });

  return socketPromise;
}

/** Whether the shared Socket.IO connection is currently connected. */
export function useRealtimeConnected(): boolean {
  return useSyncExternalStore(
    (cb) => {
      connectionListeners.add(cb);
      return () => {
        connectionListeners.delete(cb);
      };
    },
    () => connectedState,
    () => false, // SSR: always disconnected
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useRealtime(
  channel: string | null,
  handler: EventHandler,
  options?: { enabled?: boolean },
): void {
  const enabled = options?.enabled ?? true;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled || !channel) return;

    let cancelled = false;

    const socket = getSocket().then((s) => {
      if (cancelled) return null;

      if (!s.connected) {
        s.connect();
      }

      // Socket.IO rooms are server-side; the client subscribes by emitting
      // a "subscribe" event that the server handles.
      s.emit("subscribe", channel);

      const listener = (raw: unknown) => {
        try {
          const event = raw as RealtimeEvent;
          handlerRef.current(event);
        } catch {
          // Malformed events are silently ignored.
        }
      };

      s.on(channel, listener);

      return { s, listener };
    });

    return () => {
      cancelled = true;
      void socket.then((result) => {
        if (!result) return;
        const { s, listener } = result;
        s.off(channel, listener);
        s.emit("unsubscribe", channel);
      });
    };
  }, [channel, enabled]);
}