import "server-only";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/observability/logger";

/**
 * Single shared Prisma Client.
 *
 * Prisma 7 requires an explicit driver adapter; `@prisma/adapter-mariadb` is
 * the MySQL/MariaDB adapter. The instance is cached on `globalThis` in
 * development so Next.js hot reloading does not exhaust the connection pool.
 *
 * Database access is centralised here — React components never import this
 * module directly (RULES.md §4).
 *
 * Logging uses event emission rather than stdout so the known `SKIP LOCKED`
 * probe error (1064 on MariaDB < 10.6) can be filtered out — it is expected
 * and handled gracefully by `src/lib/db/locking.ts`. Real Prisma errors are
 * forwarded to the app's structured logger.
 */
function createPrismaClient() {
  const env = serverEnv();

  // The adapter accepts a connection string directly. Pool sizing is expressed
  // through the URL (e.g. `?connectionLimit=10`) so web and worker processes can
  // be tuned independently from the same code.
  const adapter = new PrismaMariaDb(env.DATABASE_URL);

  const log: Prisma.LogDefinition[] = [
    { emit: "event", level: "error" },
  ];

  if (env.NODE_ENV === "development") {
    log.push({ emit: "event", level: "warn" });
  }

  const client = new PrismaClient({
    adapter,
    log,
  });

  // Suppress the known SKIP LOCKED probe error on MariaDB < 10.6.
  // The probe in locking.ts deliberately tries FOR UPDATE SKIP LOCKED, the
  // server rejects it with SQL 1064, and the catch block gracefully falls
  // back to blocking FOR UPDATE. Prisma's own stdout logging would emit this
  // as a noisy prisma:error line before the catch sees it — event-based
  // emission lets us filter it out.
  client.$on("error", (event) => {
    if (
      event.message.includes("1064") &&
      event.message.includes("SKIP LOCKED")
    ) {
      return;
    }

    logger("db").error(
      { event: "prisma.error", target: event.target },
      event.message,
    );
  });

  if (env.NODE_ENV === "development") {
    client.$on("warn", (event) => {
      logger("db").warn(
        { event: "prisma.warn", target: event.target },
        event.message,
      );
    });
  }

  return client;
}

export type AppPrismaClient = ReturnType<typeof createPrismaClient>;

/**
 * Transaction-scoped client. Services accept this so the same logic can run
 * inside or outside `$transaction`.
 */
export type PrismaTransactionClient = Parameters<
  Parameters<AppPrismaClient["$transaction"]>[0]
>[0];

const globalForPrisma = globalThis as unknown as {
  prisma?: AppPrismaClient;
};

export const prisma: AppPrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
