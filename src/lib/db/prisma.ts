import "server-only";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "@/generated/prisma/client";
import { serverEnv } from "@/lib/env";

/**
 * Single shared Prisma Client.
 *
 * Prisma 7 requires an explicit driver adapter; `@prisma/adapter-mariadb` is
 * the MySQL/MariaDB adapter. The instance is cached on `globalThis` in
 * development so Next.js hot reloading does not exhaust the connection pool.
 *
 * Database access is centralised here — React components never import this
 * module directly (RULES.md §4).
 */
function createPrismaClient() {
  const env = serverEnv();

  // The adapter accepts a connection string directly. Pool sizing is expressed
  // through the URL (e.g. `?connectionLimit=10`) so web and worker processes can
  // be tuned independently from the same code.
  const adapter = new PrismaMariaDb(env.DATABASE_URL);

  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
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
