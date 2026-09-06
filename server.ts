/**
 * Custom Next.js server with Socket.IO + Redis Pub/Sub.
 *
 * Run with: node --import tsx server.ts  (dev)
 *           node --import tsx server.ts  (production after `next build`)
 *
 * Architecture:
 *   Worker / Server Actions ──► Redis Pub/Sub ──► This server ──► Browser
 *
 * The Socket.IO server subscribes to all `realtime:*` Redis channels and
 * forwards each message to connected browsers. Clients subscribe to
 * specific channels by emitting "subscribe" / "unsubscribe" events.
 */

// ── Bootstrap (order matters — must stay the first two imports) ─────────────
// 1. Load .env so REDIS_URL/TZ below are defined.
// 2. Set process.env.TZ (WIB) before ANY Date operation runs.
import "dotenv/config";
import "./src/lib/timezone";

import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import Redis from "ioredis";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

// ── Next.js ────────────────────────────────────────────────────────────────

const app = next({ dev, hostname, port, turbopack: dev });
const handle = app.getRequestHandler();

// ── Redis Pub/Sub clients ──────────────────────────────────────────────────

function createRedisClient(label: string): Redis {
  const client = new Redis(redisUrl, {
    lazyConnect: false,
    enableReadyCheck: true,
    maxRetriesPerRequest: null,
    retryStrategy: (attempt: number) => Math.min(attempt * 200, 10_000),
  });

  client.on("error", (error: Error) => {
    console.error(`[realtime] Redis ${label} error:`, error.message);
  });

  client.on("ready", () => {
    console.log(`[realtime] Redis ${label} connected`);
  });

  client.on("close", () => {
    console.log(`[realtime] Redis ${label} connection closed`);
  });

  client.on("reconnecting", (delay: number) => {
    console.log(`[realtime] Redis ${label} reconnecting in ${delay}ms`);
  });

  return client;
}

// ── Main ───────────────────────────────────────────────────────────────────

app.prepare().then(() => {
  const server = createServer((req, res) => {
    // Let Next.js handle all HTTP requests
    void handle(req, res, parse(req.url!, true));
  });

  // ── Socket.IO ──────────────────────────────────────────────────────────

  const io = new SocketIOServer(server, {
    path: "/socket.io",
    // In development, allow any origin; in production, restrict to self.
    cors: dev
      ? { origin: "*", methods: ["GET", "POST"] }
      : { origin: false },
    // Disable HTTP long-polling in production (WebSocket only is more efficient)
    transports: dev ? ["websocket", "polling"] : ["websocket"],
    // Match the client's reconnection settings
    pingInterval: 25_000,
    pingTimeout: 20_000,
    connectTimeout: 10_000,
  });

  // ── Redis subscriber ───────────────────────────────────────────────────

  const redisSub = createRedisClient("subscriber");
  const redisPub = createRedisClient("publisher");

  // Subscribe to all realtime channels using a pattern
  redisSub.on("pmessage", (_pattern: string, redisChannel: string, message: string) => {
    try {
      const event = JSON.parse(message) as { type?: string };
      if (!event || !event.type) return;

      // Extract the app channel name (strip "realtime:" prefix)
      const channel = redisChannel.startsWith("realtime:")
        ? redisChannel.slice(9)
        : redisChannel;

      // Emit to all clients subscribed to this channel, plus a broadcast
      // channel so the RealtimeProvider can catch everything.
      io.to(channel).emit(channel, event);
      io.emit("__broadcast__", event);
    } catch (error) {
      console.error("[realtime] Failed to process Redis message:", error instanceof Error ? error.message : String(error));
    }
  });

  // Subscribe after the listener is registered
  redisSub.psubscribe("realtime:*").then((count) => {
    console.log(`[realtime] Subscribed to ${count} Redis channel(s)`);
  }).catch((err) => {
    console.error("[realtime] Redis psubscribe error:", err.message);
  });

  // ── Socket.IO connection handling ──────────────────────────────────────

  io.on("connection", (socket) => {
    console.log(`[realtime] Client connected: ${socket.id} from ${socket.handshake.address}`);

    socket.on("subscribe", (channel: string) => {
      if (typeof channel === "string" && channel.length > 0 && channel.length <= 128) {
        void socket.join(channel);
        console.log(`[realtime] Client ${socket.id} subscribed to channel: ${channel}`);
      } else {
        console.warn(`[realtime] Client ${socket.id} attempted to subscribe to invalid channel`);
      }
    });

    socket.on("unsubscribe", (channel: string) => {
      if (typeof channel === "string" && channel.length > 0) {
        void socket.leave(channel);
        console.log(`[realtime] Client ${socket.id} unsubscribed from channel: ${channel}`);
      }
    });

    socket.on("disconnect", (reason: string) => {
      console.log(`[realtime] Client disconnected: ${socket.id} (${reason})`);
    });

    socket.on("error", (error: Error) => {
      console.error(`[realtime] Client ${socket.id} error:`, error.message);
    });
  });

  // ── Start ──────────────────────────────────────────────────────────────

  server.listen(port, () => {
    console.log(
      `> Server ready on http://${hostname}:${port} (${dev ? "dev" : "production"})`,
    );
    console.log(`> Socket.IO path: /socket.io`);
  });

  // ── Graceful shutdown ──────────────────────────────────────────────────

  const shutdown = async (signal: string) => {
    console.log(`\n[realtime] ${signal} received, shutting down...`);
    
    // 1. Stop accepting new connections
    io.close();
    
    // 2. Close Redis connections
    await redisSub.quit();
    await redisPub.quit();
    
    // 3. Close HTTP server
    server.close(() => {
      console.log("[realtime] HTTP server closed");
      process.exit(0);
    });
    
    // Force exit after timeout if server doesn't close gracefully
    setTimeout(() => {
      console.error("[realtime] Forced exit after graceful shutdown timeout");
      process.exit(1);
    }, 10_000);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("uncaughtException", (error) => {
    console.error("[realtime] Uncaught exception:", error.message);
    void shutdown("UNCAUGHT_EXCEPTION");
  });
  process.on("unhandledRejection", (reason) => {
    console.error("[realtime] Unhandled rejection:", reason);
    void shutdown("UNHANDLED_REJECTION");
  });
});