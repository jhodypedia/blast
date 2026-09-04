import { beforeEach, describe, expect, it } from "vitest";

import type { AppPrismaClient } from "@/lib/db/prisma";
import {
  detectRowLockMode,
  isUnsupportedLockSyntax,
  lockClauseFor,
  resetRowLockMode,
  rowLockClause,
  rowLockMode,
} from "@/lib/db/locking";

/**
 * Portable row locking (RULES.md §11, §12).
 *
 * The original allocation query used `FOR UPDATE OF tn SKIP LOCKED`, which is
 * MySQL-only syntax: MariaDB rejects it with a parse error on every version, so
 * starting a blast job failed with an internal error. These tests pin the
 * replacement — the emitted clause, the narrow error classification that decides
 * when to downgrade, and the once-per-process caching.
 */

type ProbeOutcome = "ok" | Error;

/**
 * Minimal Prisma stand-in. Only `$transaction` + `$queryRaw` are exercised by
 * the probe, and the recorder lets the tests assert on the emitted SQL.
 */
function fakeClient(outcomes: ProbeOutcome[]) {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  let calls = 0;

  const client = {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        $queryRaw: async (query: { sql: string; values: unknown[] }) => {
          statements.push({ sql: query.sql, values: query.values });
          const outcome = outcomes[calls] ?? outcomes[outcomes.length - 1];
          calls += 1;
          if (outcome instanceof Error) {
            throw outcome;
          }
          return [];
        },
      }),
  };

  return {
    client: client as unknown as AppPrismaClient,
    statements,
    callCount: () => calls,
  };
}

/** Mirrors the shape `@prisma/adapter-mariadb` surfaces for a 1064. */
function parseError(): Error {
  const error = new Error(
    "Raw query failed. Code: `1064`. Message: `You have an error in your SQL syntax`",
  ) as Error & { code: string; meta: Record<string, unknown> };
  error.code = "P2010";
  error.meta = { code: "1064", message: "ER_PARSE_ERROR" };
  return error;
}

beforeEach(() => {
  resetRowLockMode();
});

describe("lockClauseFor", () => {
  it("emits SKIP LOCKED without bound values", () => {
    const clause = lockClauseFor("SKIP_LOCKED");

    expect(clause.sql).toBe("FOR UPDATE SKIP LOCKED");
    expect(clause.values).toEqual([]);
  });

  it("emits a plain blocking clause in degraded mode", () => {
    const clause = lockClauseFor("BLOCKING");

    // Never `FOR UPDATE OF <alias>`: MariaDB has no such syntax.
    expect(clause.sql).toBe("FOR UPDATE");
    expect(clause.values).toEqual([]);
  });
});

describe("isUnsupportedLockSyntax", () => {
  it("recognises a MySQL/MariaDB parse error", () => {
    expect(isUnsupportedLockSyntax(parseError())).toBe(true);
  });

  it("recognises the raw driver error code", () => {
    const error = Object.assign(new Error("boom"), { errno: 1064 });
    expect(isUnsupportedLockSyntax(error)).toBe(true);
  });

  it("recognises the syntax-error SQL state", () => {
    const error = Object.assign(new Error("boom"), { sqlState: "42000" });
    expect(isUnsupportedLockSyntax(error)).toBe(true);
  });

  it("unwraps a nested cause", () => {
    const error = new Error("wrapper", { cause: parseError() });
    expect(isUnsupportedLockSyntax(error)).toBe(true);
  });

  it("does not treat a connection failure as unsupported syntax", () => {
    const error = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
      errno: -4078,
    });
    expect(isUnsupportedLockSyntax(error)).toBe(false);
  });

  it("does not treat a lock-wait timeout as unsupported syntax", () => {
    // The degraded clause blocks, so timeouts are expected in normal operation
    // and must never downgrade the mode.
    const error = Object.assign(
      new Error("Lock wait timeout exceeded; try restarting transaction"),
      { errno: 1205, sqlState: "HY000" },
    );
    expect(isUnsupportedLockSyntax(error)).toBe(false);
  });

  it("tolerates a self-referential cause chain", () => {
    const error = new Error("loop") as Error & { cause?: unknown };
    error.cause = error;
    expect(isUnsupportedLockSyntax(error)).toBe(false);
  });
});

describe("detectRowLockMode", () => {
  it("probes with a statement that matches no rows", async () => {
    const { client, statements } = fakeClient(["ok"]);

    await detectRowLockMode(client);

    expect(statements).toHaveLength(1);
    expect(statements[0]?.sql).toContain("WHERE 1 = 0");
    expect(statements[0]?.sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(statements[0]?.values).toEqual([]);
  });

  it("returns SKIP_LOCKED when the server accepts the clause", async () => {
    const { client } = fakeClient(["ok"]);

    await expect(detectRowLockMode(client)).resolves.toBe("SKIP_LOCKED");
  });

  it("falls back to BLOCKING on a parse error", async () => {
    const { client } = fakeClient([parseError()]);

    await expect(detectRowLockMode(client)).resolves.toBe("BLOCKING");
  });

  it("rethrows an unrelated failure instead of guessing", async () => {
    const connectionError = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
    });
    const { client } = fakeClient([connectionError]);

    await expect(detectRowLockMode(client)).rejects.toThrow("ECONNREFUSED");
  });
});

describe("rowLockMode", () => {
  it("probes once and reuses the result", async () => {
    const { client, callCount } = fakeClient(["ok"]);

    const results = await Promise.all([
      rowLockMode(client),
      rowLockMode(client),
      rowLockMode(client),
    ]);

    expect(results).toEqual(["SKIP_LOCKED", "SKIP_LOCKED", "SKIP_LOCKED"]);
    expect(callCount()).toBe(1);
  });

  it("caches the degraded mode too", async () => {
    const { client, callCount } = fakeClient([parseError()]);

    await rowLockMode(client);
    await rowLockMode(client);

    expect(callCount()).toBe(1);
  });

  it("does not cache a failed probe", async () => {
    const connectionError = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
    });
    const { client, callCount } = fakeClient([connectionError, "ok"]);

    await expect(rowLockMode(client)).rejects.toThrow("ECONNREFUSED");
    await expect(rowLockMode(client)).resolves.toBe("SKIP_LOCKED");
    expect(callCount()).toBe(2);
  });
});

describe("rowLockClause", () => {
  it("resolves to the clause the server supports", async () => {
    const { client } = fakeClient([parseError()]);

    const clause = await rowLockClause(client);

    expect(clause.sql).toBe("FOR UPDATE");
  });

  it("nests into a query without introducing bound values", async () => {
    const { client } = fakeClient(["ok"]);
    const clause = await rowLockClause(client);

    const { Prisma } = await import("@/generated/prisma/client");
    const query = Prisma.sql`SELECT id FROM CampaignRecipient WHERE campaignId = ${"c1"} LIMIT ${10} ${clause}`;

    expect(query.sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(query.values).toEqual(["c1", 10]);
  });
});
