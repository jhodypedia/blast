/**
 * Server capability detection for integration tests.
 *
 * `claimRecipients` relies on `SELECT ... FOR UPDATE SKIP LOCKED`, which exists
 * in MySQL >= 8.0 and MariaDB >= 10.6 but not in earlier MariaDB (XAMPP still
 * ships 10.4). Rather than failing with a bare SQL syntax error, the suites
 * check this first and report an actionable message.
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
    "Recipient claiming requires MySQL >= 8.0 or MariaDB >= 10.6.",
    "Point INTEGRATION_DATABASE_URL at a supported server to run these tests.",
  ].join(" ");
}
