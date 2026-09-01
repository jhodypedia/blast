import "server-only";

import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/redis/client";
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
 * every request, and the cache is invalidated on write. Reads never throw on a
 * missing row: the registry default is returned instead.
 */

const CACHE_TTL_SECONDS = 60;

function cacheKey(key: SettingKey): string {
  return `setting:${key}`;
}

export async function getSetting<K extends SettingKey>(
  key: K,
): Promise<SettingValue<K>> {
  const log = logger("settings");

  try {
    const cached = await redis().get(cacheKey(key));
    if (cached !== null) {
      const parsed = settingSchemas[key].safeParse(JSON.parse(cached));
      if (parsed.success) {
        return parsed.data as SettingValue<K>;
      }
      // Corrupt cache entry: drop it and fall through to the database.
      await redis().del(cacheKey(key));
    }
  } catch (error) {
    log.warn(
      { event: "settings.cache_read_failed", key, reason: String(error) },
      "Falling back to database for setting",
    );
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
    log.error(
      { event: "settings.invalid_stored_value", key },
      "Stored setting failed validation; using default",
    );
    return settingDefaults[key];
  }

  const value = parsed.data as SettingValue<K>;

  try {
    await redis().set(cacheKey(key), JSON.stringify(value), "EX", CACHE_TTL_SECONDS);
  } catch {
    // Cache write failures are non-fatal.
  }

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

  try {
    await redis().del(cacheKey(key));
  } catch {
    // Non-fatal: the TTL will expire the stale entry.
  }

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
