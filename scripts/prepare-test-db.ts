/**
 * Prepares the integration-test database.
 *
 * Creates the database if it is missing, then applies the committed migrations
 * with `prisma migrate deploy` (never `db push` — RULES.md §20).
 *
 * Safety: the target database name must contain `test`. This script truncates
 * nothing itself, but the suites that follow delete rows, so pointing it at a
 * development or production database is refused outright.
 *
 * Usage: npm run db:test:setup
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "../src/generated/prisma/client";

const DEFAULT_URL = "mysql://root@127.0.0.1:3307/blast_test?connectionLimit=12";

const rawUrl = process.env.INTEGRATION_DATABASE_URL ?? DEFAULT_URL;
const parsed = new URL(rawUrl);
const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));

if (!databaseName) {
  throw new Error(`No database name in INTEGRATION_DATABASE_URL: ${rawUrl}`);
}

if (!/test/i.test(databaseName)) {
  throw new Error(
    `Refusing to prepare "${databaseName}": the integration test database name must contain "test".`,
  );
}

// MySQL identifiers cannot be parameterised, so validate instead of interpolate
// blindly. Anything outside this character set is rejected.
if (!/^[A-Za-z0-9_]+$/.test(databaseName)) {
  throw new Error(
    `Unsupported database name "${databaseName}": use letters, digits and underscores only.`,
  );
}

async function createDatabase(): Promise<void> {
  // `information_schema` always exists, so it is a safe bootstrap target.
  const bootstrapUrl = new URL(rawUrl);
  bootstrapUrl.pathname = "/information_schema";

  const adapter = new PrismaMariaDb(bootstrapUrl.toString());
  const client = new PrismaClient({ adapter, log: ["error"] });

  try {
    await client.$executeRawUnsafe(
      `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    console.log(`Database ready: ${databaseName}`);
  } finally {
    await client.$disconnect();
  }
}

function deployMigrations(): void {
  // Invoke the Prisma CLI entrypoint with the current Node binary rather than
  // going through `npx`: no shell, no `.cmd` resolution, no PATH assumptions.
  const cli = fileURLToPath(
    new URL("../node_modules/prisma/build/index.js", import.meta.url),
  );

  const result = spawnSync(process.execPath, [cli, "migrate", "deploy"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: rawUrl },
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy failed (exit ${result.status})`);
  }
}

await createDatabase();
deployMigrations();
console.log(`Integration test database prepared: ${databaseName}`);
