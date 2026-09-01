import type { Metadata } from "next";
import { Smartphone } from "lucide-react";

import { requireUser } from "@/lib/auth/session";
import { listUserDevices } from "@/lib/device/service";
import { getSetting } from "@/lib/settings/service";
import { SETTING_KEYS } from "@/lib/constants";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AddDeviceForm } from "@/components/devices/add-device-form";
import { DeviceCard } from "@/components/devices/device-card";

export const metadata: Metadata = { title: "Devices" };

/**
 * Device management for the signed-in operator.
 *
 * Only the caller's own devices are listed, and numbers are masked by the device
 * service before they leave the server (RULES.md §8).
 */
export default async function DevicesPage() {
  const actor = await requireUser();

  const [devices, maxDevices, pairCodeEnabled] = await Promise.all([
    listUserDevices(actor.id),
    getSetting(SETTING_KEYS.maxDevicesPerUser),
    getSetting(SETTING_KEYS.pairCodeEnabled),
  ]);

  const atCapacity = devices.length >= maxDevices;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Devices</h1>
        <p className="text-sm text-muted-foreground">
          Connect up to {maxDevices} WhatsApp devices. Each device can run one
          blast job at a time.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Add a device</CardTitle>
          <CardDescription>
            {atCapacity
              ? `You have reached the limit of ${maxDevices} devices. Remove one to add another.`
              : `${devices.length} of ${maxDevices} slots used.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AddDeviceForm disabled={atCapacity} />
        </CardContent>
      </Card>

      {devices.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <span className="rounded-full bg-muted p-3">
              <Smartphone
                className="size-6 text-muted-foreground"
                aria-hidden="true"
              />
            </span>
            <p className="text-sm text-muted-foreground">
              No devices yet. Add one above, then pair it with WhatsApp.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {devices.map((device) => (
            <DeviceCard
              key={device.id}
              pairCodeEnabled={pairCodeEnabled}
              device={{
                id: device.id,
                label: device.label,
                status: device.status,
                maskedNumber: device.maskedNumber,
                lastConnectedAt:
                  device.lastConnectedAt?.toISOString() ?? null,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
