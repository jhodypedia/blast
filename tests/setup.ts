/**
 * Test bootstrap.
 *
 * Provides deterministic, non-production values for the environment variables the
 * server modules validate at import time. Nothing here touches a real database,
 * Redis instance, or WhatsApp session.
 */
// `export {}` makes this a module: without it the file is a global script and
// its top-level `env` collides with the one in `tests/integration/setup.ts`.
export {};

const env = process.env as Record<string, string | undefined>;

env.NODE_ENV ??= "test";
env.DATABASE_URL ??= "mysql://test:test@127.0.0.1:3306/wablast_test";
env.REDIS_URL ??= "redis://127.0.0.1:6379";
env.AUTH_SECRET ??= "test-secret-value-that-is-long-enough-32";
// 32 zero bytes, base64 encoded. Test-only.
env.ENCRYPTION_KEY ??= "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
env.PRIVATE_STORAGE_DIR ??= "./.tmp-test-storage";
env.LOG_LEVEL ??= "fatal";
env.WORKER_ID ??= "test-worker";
