import type { Metadata } from "next";
import { PlusCircle, ShieldAlert, Smartphone } from "lucide-react";

import { requireUser } from "@/lib/auth/session";
import { listUserDevices } from "@/lib/device/service";
import { getSetting } from "@/lib/settings/service";
import { SETTING_KEYS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import {
  EmptyState,
  Notice,
  PageHeader,
  PageSections,
  SectionCard,
} from "@/components/ui/page";
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
  const connected = devices.filter((d) => d.status === "CONNECTED").length;

  return (
    <>
      <PageHeader
        icon={<Smartphone className="size-5" />}
        title="Devices"
        description={`Connect up to ${maxDevices} WhatsApp devices. Each device can run one blast job at a time.`}
        actions={
          <Badge variant={atCapacity ? "warning" : "success"}>
            {connected} connected · {devices.length}/{maxDevices} slots
          </Badge>
        }
      />

      <PageSections>
        <SectionCard
          title="Add a device"
          description={
            atCapacity
              ? `You have reached the limit of ${maxDevices} devices. Remove one to add another.`
              : `${devices.length} of ${maxDevices} slots used.`
          }
          icon={<PlusCircle className="size-5" />}
          tone={atCapacity ? "warning" : "primary"}
        >
          {atCapacity ? (
            <Notice
              tone="warning"
              icon={<ShieldAlert className="size-5" />}
              title="Device limit reached"
              className="mb-5"
            >
              The limit is set by the platform team. Remove an existing device to
              free a slot.
            </Notice>
          ) : null}
          <AddDeviceForm disabled={atCapacity} />
        </SectionCard>

        {devices.length === 0 ? (
          <EmptyState
            icon={<Smartphone className="size-6" />}
            title="No devices yet"
            description="Add one above, then pair it with WhatsApp to start running assigned campaigns."
          />
        ) : (
          <Stagger className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {devices.map((device) => (
              <StaggerItem key={device.id}>
                <DeviceCard
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
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </PageSections>
    </>
  );
}
