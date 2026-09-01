import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings/service";
import { SETTING_KEYS } from "@/lib/constants";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SettingRow } from "@/components/admin/setting-row";

export const metadata: Metadata = { title: "Settings" };

/**
 * Platform settings.
 *
 * Values are edited as JSON and re-validated against the settings registry on the
 * server; an invalid value is rejected rather than stored (RULES.md §17).
 */
const EDITABLE = [
  {
    key: SETTING_KEYS.maxDevicesPerUser,
    label: "Maximum devices per operator",
    help: "Whole number between 1 and the platform ceiling.",
  },
  {
    key: SETTING_KEYS.pairCodeEnabled,
    label: "Pair-code pairing enabled",
    help: "true or false.",
  },
  {
    key: SETTING_KEYS.qrEnabled,
    label: "QR pairing enabled",
    help: "true or false.",
  },
  {
    key: SETTING_KEYS.deviceInactivityDays,
    label: "Device inactivity expiry (days)",
    help: "Devices idle for longer are marked expired.",
  },
  {
    key: SETTING_KEYS.defaultCountryCode,
    label: "Default country code",
    help: 'Two-letter code as a JSON string, e.g. "ID".',
  },
  {
    key: SETTING_KEYS.maxTargetFileBytes,
    label: "Maximum target file size (bytes)",
    help: "Applies to every target upload.",
  },
  {
    key: SETTING_KEYS.allowedSpeeds,
    label: "Allowed sending speeds",
    help: "JSON array using only 1, 3, 6 and 10.",
  },
  {
    key: SETTING_KEYS.maxActiveJobsPerUser,
    label: "Maximum live jobs per operator",
    help: "Whole number between 1 and 50.",
  },
  {
    key: SETTING_KEYS.defaultPayoutPerSend,
    label: "Default payout per send",
    help: 'Amount as a JSON string, e.g. "25".',
  },
  {
    key: SETTING_KEYS.defaultCurrency,
    label: "Default currency",
    help: 'Three-letter code as a JSON string, e.g. "IDR".',
  },
  {
    key: SETTING_KEYS.minWithdrawalAmount,
    label: "Minimum withdrawal amount",
    help: 'Amount as a JSON string, e.g. "50000".',
  },
  {
    key: SETTING_KEYS.withdrawalFee,
    label: "Withdrawal fee",
    help: 'Amount as a JSON string, e.g. "2500".',
  },
  {
    key: SETTING_KEYS.withdrawalsEnabled,
    label: "Withdrawals enabled",
    help: "true or false.",
  },
  {
    key: SETTING_KEYS.registrationEnabled,
    label: "Registration enabled",
    help: "true or false.",
  },
  {
    key: SETTING_KEYS.sessionHours,
    label: "Session lifetime (hours)",
    help: "Whole number between 1 and 72.",
  },
  {
    key: SETTING_KEYS.deliveryLogRetentionDays,
    label: "Delivery log retention (days)",
    help: "One of 7, 14, 30, 60 or 90.",
  },
  {
    key: SETTING_KEYS.maintenanceMode,
    label: "Maintenance mode",
    help: 'JSON object: { "enabled": false, "message": "" }.',
  },
] as const;

export default async function AdminSettingsPage() {
  await requireAdmin();

  const values = await getSettings(EDITABLE.map((entry) => entry.key));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Every change is validated against its schema and written to the audit
          log.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Platform configuration</CardTitle>
          <CardDescription>
            Values use JSON syntax. Strings need quotes; numbers and booleans do
            not.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {EDITABLE.map((entry) => (
            <SettingRow
              key={entry.key}
              settingKey={entry.key}
              label={entry.label}
              help={entry.help}
              value={JSON.stringify(
                values[entry.key as keyof typeof values],
              )}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
