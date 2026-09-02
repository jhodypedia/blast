/**
 * Integration test bootstrap.
 *
 * Unlike `tests/setup.ts`, this points the Prisma client at a real database. It
 * must run before any module that reads `serverEnv()` at import time, which is
 * why it is registered as a Vitest `setupFile` rather than imported by a test.
 *
 * The database is a throwaway one (`blast_test`); these tests delete their own
 * fixtures and must never be pointed at a development or production database.
 *
 * Port 3307 is the portable MariaDB 11.4 instance from `_run_mariadb.ps1`, not
 * XAMPP's 3306: recipient claiming needs `FOR UPDATE SKIP LOCKED`, which XAMPP's
 * MariaDB 10.4 does not implement. Override with `INTEGRATION_DATABASE_URL`.
 */
// `export {}` makes this a module. Without it both setup files are global
// scripts and their top-level `env` declarations collide under tsc.
export {};

const env = process.env as Record<string, string | undefined>;

env.NODE_ENV ??= "test";
// A modest pool is required: the concurrency tests open several simultaneous
// transactions and would otherwise deadlock waiting for a free connection.
env.DATABASE_URL =
  env.INTEGRATION_DATABASE_URL ??
  "mysql://root@127.0.0.1:3307/blast_test?connectionLimit=12";
env.REDIS_URL ??= "redis://127.0.0.1:6379";
env.AUTH_SECRET ??= "test-secret-value-that-is-long-enough-32";
// 32 zero bytes, base64 encoded. Test-only.
env.ENCRYPTION_KEY ??= "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
env.PRIVATE_STORAGE_DIR ??= "./.tmp-test-storage";
env.LOG_LEVEL ??= "fatal";
env.WORKER_ID ??= "test-worker";
