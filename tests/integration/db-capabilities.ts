/**
 * Server capability detection for integration tests.
 *
 * `SELECT ... FOR UPDATE SKIP LOCKED` exists in MySQL >= 8.0 and MariaDB >= 10.6
 * but not in earlier MariaDB (XAMPP still ships 10.4). Production degrades to a
 * blocking `FOR UPDATE` there (see `src/lib/db/locking.ts`), but these suites
 * assert the *disjoint-batch* semantics that only `SKIP LOCKED` provides, so they
 * check the capability first and report an actionable message instead of failing
 * with a bare SQL syntax error or a lock-wait timeout.
 */
import { prisma } from "@/lib/db/prisma";

export type ServerCapabilities = {
  version: string;
  supportsSkipLocked: boolean;
};

let cached: ServerCapabilities | null = null;

export async function detectCapabilities(): Promise<ServerCapabilities> {
  if (cached) {
    return cached;
  }

  const rows =
    await prisma.$queryRaw<Array<{ version: string }>>`SELECT VERSION() AS version`;
  const version = rows[0]?.version ?? "unknown";

  // Probe rather than parse version strings: forks and distro builds lie.
  let supportsSkipLocked = true;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM CampaignRecipient WHERE 1 = 0 FOR UPDATE SKIP LOCKED`;
    });
  } catch {
    supportsSkipLocked = false;
  }

  cached = { version, supportsSkipLocked };
  return cached;
}

export function skipLockedRequirementMessage(version: string): string {
  return [
    `Database at "${version}" does not support FOR UPDATE SKIP LOCKED.`,
    "The application degrades to a blocking FOR UPDATE on such a server, but these",
    "tests assert that concurrent workers receive disjoint batches, which only",
    "SKIP LOCKED provides. Requires MySQL >= 8.0 or MariaDB >= 10.6.",
    "Point INTEGRATION_DATABASE_URL at a supported server and run",
    "`npm run db:test:setup` before running these tests.",
  ].join(" ");
}
