import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Integration test configuration.
 *
 * These tests require a live MySQL/MariaDB server and run against a dedicated
 * database (`blast_test` by default, override with `INTEGRATION_DATABASE_URL`).
 * They are excluded from `npm test` because they are not hermetic.
 *
 * Concurrency tests deliberately open several transactions at once, so files run
 * sequentially in a single fork: parallel *files* would fight over the same
 * fixture rows, while parallelism *inside* a test is what we actually assert on.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.integration.test.ts", "tests/**/*.integration.test.ts"],
    setupFiles: ["./tests/integration/setup.ts"],
    pool: "forks",
    // A single worker keeps files sequential so fixtures in different files
    // cannot interleave; the parallelism under test happens *inside* each test
    // via Promise.all.
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
