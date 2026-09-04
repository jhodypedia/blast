import type { Metadata } from "next";
import {
  CheckCircle2,
  CircleDot,
  PlusCircle,
  ShieldAlert,
  Smartphone,
  Wifi,
} from "lucide-react";

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

export const metadata: Metadata = { title: "Perangkat" };

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
        title="Perangkat"
        description={`Hubungkan hingga ${maxDevices} perangkat WhatsApp. Setiap perangkat dapat menjalankan satu pekerjaan blast.`}
        actions={
          <Badge variant={atCapacity ? "warning" : "success"}>
            {connected} terhubung · {devices.length}/{maxDevices} slot
          </Badge>
        }
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="border-4 border-black bg-success p-4 text-success-foreground shadow-panel">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center border-4 border-black bg-background text-foreground">
              <Wifi className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-widest">
                Status jaringan
              </p>
              <p className="mt-1 text-sm font-black uppercase">
                Sistem siap digunakan
              </p>
            </div>
          </div>
        </div>
        <div className="border-4 border-black bg-primary p-4 text-primary-foreground shadow-panel">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center border-4 border-black bg-background text-foreground">
              <CircleDot className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-widest">
                Slot tersedia
              </p>
              <p className="mt-1 text-sm font-black uppercase">
                {maxDevices - devices.length} dari {maxDevices} slot
              </p>
            </div>
          </div>
        </div>
        <div className="border-4 border-black bg-info p-4 text-info-foreground shadow-panel">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center border-4 border-black bg-background text-foreground">
              <CheckCircle2 className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-widest">
                Perangkat aktif
              </p>
              <p className="mt-1 text-sm font-black uppercase">
                {connected} siap blast
              </p>
            </div>
          </div>
        </div>
      </div>

      <PageSections>
        <SectionCard
          title="Tambah perangkat"
          description={
            atCapacity
              ? `You have reached the limit of ${maxDevices} devices. Remove one to add another.`
              : `${devices.length} dari ${maxDevices} slot digunakan.`
          }
          icon={<PlusCircle className="size-5" />}
          tone={atCapacity ? "warning" : "primary"}
        >
          {atCapacity ? (
            <Notice
              tone="warning"
              icon={<ShieldAlert className="size-5" />}
              title="Batas perangkat tercapai"
              className="mb-5"
            >
              Batas ini ditentukan oleh admin. Hapus perangkat yang ada untuk
              membebaskan slot.
            </Notice>
          ) : null}
          <AddDeviceForm disabled={atCapacity} />
        </SectionCard>

        {devices.length === 0 ? (
          <EmptyState
            icon={<Smartphone className="size-6" />}
            title="Belum ada perangkat"
            description="Tambahkan perangkat di atas, lalu hubungkan ke WhatsApp untuk menjalankan kampanye yang ditugaskan."
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
