import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { AppPrismaClient } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/logger";

/**
 * Portable row-locking clause for locking reads (RULES.md §11, §12).
 *
 * Recipient allocation and worker claiming both need a locking `SELECT`. The
 * preferred form is `FOR UPDATE SKIP LOCKED`, which lets concurrent operators
 * take disjoint slices, but it only exists in MySQL >= 8.0 and MariaDB >= 10.6.
 * XAMPP still ships MariaDB 10.4, where the clause is a parse error (1064), and
 * MariaDB has never accepted MySQL's `FOR UPDATE OF <table>` variant at all.
 *
 * The server is probed once per process and the strongest supported clause is
 * reused afterwards. On an older server the read degrades to a blocking
 * `FOR UPDATE`: callers queue behind each other instead of skipping locked rows.
 * That costs concurrency, never correctness — one row per number per campaign is
 * guaranteed by the unique (campaignId, normalizedNumber) constraint plus
 * `skipDuplicates` and the post-insert recount, and one worker per recipient by
 * the conditional status transitions in `recipient-claim.ts`.
 */

export type RowLockMode = "SKIP_LOCKED" | "BLOCKING";

/**
 * Both clauses are fixed literals. Nothing user-supplied is ever interpolated as
 * raw SQL: only this suffix is raw, every value stays a bound parameter.
 */
const CLAUSES: Record<RowLockMode, Prisma.Sql> = {
  SKIP_LOCKED: Prisma.raw("FOR UPDATE SKIP LOCKED"),
  BLOCKING: Prisma.raw("FOR UPDATE"),
};

/** Probe statement: matches no rows, so it locks nothing and costs nothing. */
const SKIP_LOCKED_PROBE = Prisma.sql`SELECT 1 FROM CampaignRecipient WHERE 1 = 0 ${CLAUSES.SKIP_LOCKED}`;

/** Returns the locking suffix for a known mode. */
export function lockClauseFor(mode: RowLockMode): Prisma.Sql {
  return CLAUSES[mode];
}

/**
 * Flattens the fields a driver/Prisma error can carry its SQL error code in.
 * Depth-limited because `cause` chains can be self-referential.
 */
function errorText(error: unknown, depth = 0): string {
  if (error === null || error === undefined) {
    return "";
  }
  if (typeof error !== "object") {
    return String(error);
  }
  if (depth > 3) {
    return "";
  }

  const record = error as Record<string, unknown>;
  const parts: string[] = [];

  for (const key of ["message", "code", "errno", "sqlState", "sqlMessage"]) {
    const value = record[key];
    if (typeof value === "string" || typeof value === "number") {
      parts.push(String(value));
    }
  }

  const meta = record.meta;
  if (meta !== null && typeof meta === "object") {
    for (const value of Object.values(meta)) {
      if (typeof value === "string" || typeof value === "number") {
        parts.push(String(value));
      }
    }
  }

  if (record.cause !== undefined) {
    parts.push(errorText(record.cause, depth + 1));
  }

  return parts.join(" ");
}

/**
 * True when the error is the server rejecting the clause as invalid syntax
 * rather than a connectivity, permission or timeout problem. Only a syntax
 * rejection may be treated as "this server is too old".
 *
 * Matched on error codes rather than message text: drivers echo the failing
 * statement back in their messages, so a phrase match would classify a dropped
 * connection as unsupported syntax and cache the degraded mode for the process.
 */
export function isUnsupportedLockSyntax(error: unknown): boolean {
  const text = errorText(error);

  return (
    /\b1064\b/.test(text) ||
    /ER_PARSE_ERROR/i.test(text) ||
    /\b42000\b/.test(text)
  );
}

/** Runs the probe. Exported without caching so tests can drive it directly. */
export async function detectRowLockMode(
  client: AppPrismaClient,
): Promise<RowLockMode> {
  try {
    await client.$transaction(async (tx) => {
      await tx.$queryRaw(SKIP_LOCKED_PROBE);
    });
    return "SKIP_LOCKED";
  } catch (error) {
    // A dropped connection or denied grant says nothing about the server's
    // capabilities, so it must not be remembered as one.
    if (!isUnsupportedLockSyntax(error)) {
      throw error;
    }

    logger("db").warn(
      { event: "db.skip_locked_unsupported" },
      "Database does not support FOR UPDATE SKIP LOCKED; locking reads will block instead of skipping. Use MySQL >= 8.0 or MariaDB >= 10.6 for concurrent throughput.",
    );

    return "BLOCKING";
  }
}

let cached: Promise<RowLockMode> | null = null;

/** Probes once per process; every later caller reuses the answer. */
export function rowLockMode(client: AppPrismaClient): Promise<RowLockMode> {
  if (!cached) {
    cached = detectRowLockMode(client).catch((error: unknown) => {
      // Never cache a failed probe: the next caller retries.
      cached = null;
      throw error;
    });
  }

  return cached;
}

/** Convenience wrapper: the locking suffix this server actually supports. */
export async function rowLockClause(
  client: AppPrismaClient,
): Promise<Prisma.Sql> {
  return lockClauseFor(await rowLockMode(client));
}

/** Clears the cached probe result. Used by tests. */
export function resetRowLockMode(): void {
  cached = null;
}
