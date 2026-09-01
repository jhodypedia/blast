import "server-only";

import { prisma } from "@/lib/db/prisma";
import { withRedis } from "@/lib/redis/client";
import { logger } from "@/lib/observability/logger";
import { validationError } from "@/lib/errors";
import {
  settingDefaults,
  settingSchemas,
  type SettingKey,
  type SettingValue,
} from "@/lib/settings/registry";

/**
 * Settings service.
 *
 * Values are cached in Redis for a short TTL to avoid a database round trip on
 * every request. The cache is strictly an optimisation: every read goes through
 * `withRedis`, so when Redis is unreachable the database (and ultimately the
 * registry default) answers instead of the request failing.
 */

const CACHE_TTL_SECONDS = 60;

function cacheKey(key: SettingKey): string {
  return `setting:${key}`;
}

/** `JSON.parse` that reports failure instead of throwing. */
function safeJsonParse(raw: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

export async function getSetting<K extends SettingKey>(
  key: K,
): Promise<SettingValue<K>> {
  const cached = await withRedis(
    (client) => client.get(cacheKey(key)),
    null as string | null,
  );

  if (cached !== null) {
    // A corrupt entry must not break the request; fall through to the database.
    const decoded = safeJsonParse(cached);
    if (decoded.ok) {
      const parsed = settingSchemas[key].safeParse(decoded.value);
      if (parsed.success) {
        return parsed.data as SettingValue<K>;
      }
    }
    await withRedis((client) => client.del(cacheKey(key)), 0);
  }

  const row = await prisma.setting.findUnique({
    where: { key },
    select: { value: true },
  });

  if (!row) {
    return settingDefaults[key];
  }

  const parsed = settingSchemas[key].safeParse(row.value);
  if (!parsed.success) {
    logger("settings").error(
      { event: "settings.invalid_stored_value", key },
      "Stored setting failed validation; using default",
    );
    return settingDefaults[key];
  }

  const value = parsed.data as SettingValue<K>;

  await withRedis(
    (client) =>
      client.set(cacheKey(key), JSON.stringify(value), "EX", CACHE_TTL_SECONDS),
    null,
  );

  return value;
}

/**
 * Writes a setting after schema validation. Callers must have already asserted
 * ADMIN and must record an audit entry with the before/after summary.
 */
export async function setSetting<K extends SettingKey>(
  key: K,
  rawValue: unknown,
  actorUserId: string,
): Promise<{ previous: SettingValue<K>; next: SettingValue<K> }> {
  const parsed = settingSchemas[key].safeParse(rawValue);
  if (!parsed.success) {
    throw validationError("The submitted setting value is invalid.", {
      [key]: parsed.error.issues.map((issue) => issue.message),
    });
  }

  const previous = await getSetting(key);
  const next = parsed.data as SettingValue<K>;

  await prisma.setting.upsert({
    where: { key },
    create: {
      key,
      value: next as never,
      updatedByUserId: actorUserId,
    },
    update: {
      value: next as never,
      updatedByUserId: actorUserId,
    },
  });

  // Non-fatal if Redis is down: the TTL expires the stale entry anyway.
  await withRedis((client) => client.del(cacheKey(key)), 0);

  return { previous, next };
}

/** Loads several settings at once for admin screens. */
export async function getSettings<K extends SettingKey>(
  keys: readonly K[],
): Promise<{ [P in K]: SettingValue<P> }> {
  const entries = await Promise.all(
    keys.map(async (key) => [key, await getSetting(key)] as const),
  );
  return Object.fromEntries(entries) as { [P in K]: SettingValue<P> };
}
