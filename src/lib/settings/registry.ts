import "server-only";

import { z } from "zod";

import {
  DEFAULT_COUNTRY_CODE,
  DEFAULT_CURRENCY,
  DEFAULT_MAX_DEVICES_PER_USER,
  DEFAULT_MIN_WITHDRAWAL_AMOUNT,
  DEFAULT_WITHDRAWAL_FEE,
  DELIVERY_LOG_RETENTION_DAYS,
  MAX_DEVICES_PER_USER_LIMIT,
  MAX_TARGET_FILE_BYTES,
  SETTING_KEYS,
} from "@/lib/constants";
import { allowedSpeedsSchema } from "@/lib/validation/campaign";
import { countryCodeSchema, moneyStringSchema } from "@/lib/validation/common";

/**
 * Admin settings registry (RULES.md §17).
 *
 * Every setting declares a Zod schema and a default. Reads always go through
 * `getSetting`, which falls back to the default when the row is absent, so the
 * application never depends on a seeded database row to boot.
 */

export const settingSchemas = {
  [SETTING_KEYS.maxDevicesPerUser]: z
    .number()
    .int()
    .min(1)
    .max(MAX_DEVICES_PER_USER_LIMIT),
  [SETTING_KEYS.pairCodeEnabled]: z.boolean(),
  [SETTING_KEYS.qrEnabled]: z.boolean(),
  [SETTING_KEYS.deviceInactivityDays]: z.number().int().min(1).max(365),
  [SETTING_KEYS.defaultCountryCode]: countryCodeSchema,
  [SETTING_KEYS.maxTargetFileBytes]: z
    .number()
    .int()
    .min(1024)
    .max(200 * 1024 * 1024),
  [SETTING_KEYS.minWithdrawalAmount]: moneyStringSchema,
  [SETTING_KEYS.withdrawalFee]: moneyStringSchema,
  [SETTING_KEYS.withdrawalsEnabled]: z.boolean(),
  [SETTING_KEYS.registrationEnabled]: z.boolean(),
  [SETTING_KEYS.sessionHours]: z.number().int().min(1).max(72),
  [SETTING_KEYS.maintenanceMode]: z.object({
    enabled: z.boolean(),
    message: z.string().trim().max(500),
  }),
  [SETTING_KEYS.allowedSpeeds]: allowedSpeedsSchema,
  [SETTING_KEYS.maxActiveJobsPerUser]: z.number().int().min(1).max(50),
  [SETTING_KEYS.defaultPayoutPerSend]: moneyStringSchema,
  [SETTING_KEYS.defaultCurrency]: z.string().trim().toUpperCase().length(3),
  [SETTING_KEYS.deliveryLogRetentionDays]: z.union([
    z.literal(7),
    z.literal(14),
    z.literal(30),
    z.literal(60),
    z.literal(90),
  ]),
} as const;

export type SettingKey = keyof typeof settingSchemas;
export type SettingValue<K extends SettingKey> = z.infer<
  (typeof settingSchemas)[K]
>;

export const settingDefaults: {
  [K in SettingKey]: SettingValue<K>;
} = {
  [SETTING_KEYS.maxDevicesPerUser]: DEFAULT_MAX_DEVICES_PER_USER,
  [SETTING_KEYS.pairCodeEnabled]: true,
  [SETTING_KEYS.qrEnabled]: true,
  [SETTING_KEYS.deviceInactivityDays]: 30,
  [SETTING_KEYS.defaultCountryCode]: DEFAULT_COUNTRY_CODE,
  [SETTING_KEYS.maxTargetFileBytes]: MAX_TARGET_FILE_BYTES,
  [SETTING_KEYS.minWithdrawalAmount]: DEFAULT_MIN_WITHDRAWAL_AMOUNT,
  [SETTING_KEYS.withdrawalFee]: DEFAULT_WITHDRAWAL_FEE,
  [SETTING_KEYS.withdrawalsEnabled]: true,
  [SETTING_KEYS.registrationEnabled]: true,
  [SETTING_KEYS.sessionHours]: 8,
  [SETTING_KEYS.maintenanceMode]: { enabled: false, message: "" },
  [SETTING_KEYS.allowedSpeeds]: [1, 3, 6, 10],
  [SETTING_KEYS.maxActiveJobsPerUser]: 2,
  [SETTING_KEYS.defaultPayoutPerSend]: "25",
  [SETTING_KEYS.defaultCurrency]: DEFAULT_CURRENCY,
  [SETTING_KEYS.deliveryLogRetentionDays]:
    DELIVERY_LOG_RETENTION_DAYS === 90 ? 90 : 30,
};

export function isSettingKey(value: string): value is SettingKey {
  return Object.prototype.hasOwnProperty.call(settingSchemas, value);
}
