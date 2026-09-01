import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma 7 configuration.
 *
 * In Prisma 7 the datasource URL lives here (not in schema.prisma) and the
 * `prisma-client` generator requires an explicit `output` path.
 *
 * Migrations are always applied through `prisma migrate dev` (local) and
 * `prisma migrate deploy` (production). `prisma db push` is never used for
 * production deployments — see RULES.md §20.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
    // Optional: only used by `prisma migrate dev` for drift detection.
    ...(process.env.SHADOW_DATABASE_URL
      ? { shadowDatabaseUrl: env("SHADOW_DATABASE_URL") }
      : {}),
  },
});
