import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

/**
 * Vitest configuration.
 *
 * Unit tests run in the Node environment because most logic under test is
 * server-side. Tests that need a live database or Redis are named
 * `*.integration.test.ts` and are excluded from the default run.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws when imported outside a server component. Tests
      // exercise these modules directly, so it is stubbed out.
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "tests/**/*.test.ts"],
    exclude: [
      "node_modules/**",
      ".next/**",
      "src/generated/**",
      "**/*.integration.test.ts",
    ],
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      exclude: ["src/generated/**", "**/*.d.ts"],
    },
  },
});
