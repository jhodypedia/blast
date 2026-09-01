/**
 * Central, validated environment access.
 *
 * Nothing else in the codebase may read `process.env` for these values, so a
 * missing or malformed variable fails fast at startup instead of at request
 * time. Client-safe values are exposed separately and are the only ones that
 * may be referenced from browser bundles.
 */
import { z } from "zod";

const nodeEnvSchema = z.enum(["development", "test", "production"]);

const serverSchema = z.object({
  NODE_ENV: nodeEnvSchema.default("development"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SHADOW_DATABASE_URL: z.string().min(1).optional(),

  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  AUTH_TRUST_HOST: z
    .string()
    .optional()
    .transform((value) => value === "true"),

  /** 32-byte key, base64 encoded. Used for AES-256-GCM at-rest encryption. */
  ENCRYPTION_KEY: z.string().min(1, "ENCRYPTION_KEY is required"),

  TURNSTILE_SECRET_KEY: z.string().min(1).optional(),

  /** Private storage root for target uploads and campaign media. */
  PRIVATE_STORAGE_DIR: z.string().min(1).default("./storage"),

  /** Shared secret required by /api/health for non-public probes. */
  HEALTH_CHECK_TOKEN: z.string().min(16).optional(),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),

  /** Identifies this worker process in recipient leases. */
  WORKER_ID: z.string().min(1).optional(),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(4),
});

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type ClientEnv = z.infer<typeof clientSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
}

let cachedServerEnv: ServerEnv | null = null;

/**
 * Treats an empty variable as absent.
 *
 * `.env` templates ship optional keys as `KEY=""`, which would otherwise fail a
 * `min(1)` check instead of falling through to the optional branch.
 */
function withoutEmptyValues(
  source: NodeJS.ProcessEnv,
): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(source)) {
    result[key] = value === "" ? undefined : value;
  }
  return result;
}

/**
 * Server-only environment. Throws on first access when misconfigured.
 * Never call this from a component that can be bundled for the browser.
 */
export function serverEnv(): ServerEnv {
  if (cachedServerEnv) {
    return cachedServerEnv;
  }

  const parsed = serverSchema.safeParse(withoutEmptyValues(process.env));
  if (!parsed.success) {
    throw new Error(
      `Invalid server environment configuration:\n${formatIssues(parsed.error)}`,
    );
  }

  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}

/**
 * Client-safe environment. Values are inlined by Next.js at build time, so the
 * literal `process.env.NEXT_PUBLIC_*` reads below are intentional.
 */
export const clientEnv: ClientEnv = clientSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
});

export function isProduction(): boolean {
  return serverEnv().NODE_ENV === "production";
}
