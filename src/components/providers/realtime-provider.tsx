"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRealtime, useRealtimeConnected } from "@/hooks/use-realtime";
import type { RealtimeEvent } from "@/lib/realtime/types";

/**
 * Realtime context provider.
 *
 * Wraps the app and piggybacks on the shared Socket.IO singleton from
 * `use-realtime`. On receiving events, it invalidates relevant TanStack Query
 * caches so the UI re-fetches fresh data without a full page reload.
 *
 * This provider is intentionally thin: it only handles cache invalidation.
 * Components that need raw event access should use `useRealtime` directly.
 */

type RealtimeContextValue = {
  connected: boolean;
};

const RealtimeContext = createContext<RealtimeContextValue>({ connected: false });

export function useRealtimeStatus(): RealtimeContextValue {
  return useContext(RealtimeContext);
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const connected = useRealtimeConnected();

  // ── Global event handler: invalidate TanStack Query caches ──────────────

  const handleRealtimeEvent = (event: RealtimeEvent) => {
    switch (event.type) {
      case "blast-job:progress":
      case "blast-job:lifecycle":
        // Invalidate device-page queries for the affected user's devices
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey as string[];
            return (
              key[0] === "device-blast-status" ||
              key[0] === "user-devices" ||
              key[0] === "delivery-log" ||
              (key[0] === "blast-job" && key[1] === event.blastJobId)
            );
          },
        });
        break;

      case "device:status":
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey as string[];
            return (
              key[0] === "user-devices" ||
              key[0] === "device-blast-status"
            );
          },
        });
        break;

      case "admin:refresh":
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey as string[];
            return key[0] === `admin-${event.resource}`;
          },
        });
        break;
    }
  };

  // Listen on the broadcast channel for all events the server forwards.
  // The actual socket is the shared singleton from use-realtime.
  useRealtime("__broadcast__", handleRealtimeEvent);

  return (
    <RealtimeContext.Provider value={{ connected }}>
      {children}
    </RealtimeContext.Provider>
  );
}