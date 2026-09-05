import type { Metadata } from "next";
import {
  CheckCircle2,
  CircleDot,
  ListChecks,
  PlusCircle,
  Radio,
  ScrollText,
  ShieldAlert,
  Smartphone,
  Wifi,
} from "lucide-react";

import { requireUser } from "@/lib/auth/session";
import { listUserDevices } from "@/lib/device/service";
import {
  listCampaignsForUser,
  remainingAllocation,
} from "@/lib/campaign/service";
import {
  listDeviceBlastStatus,
  listUserDeliveryLog,
} from "@/lib/blast/queries";
import { getSetting } from "@/lib/settings/service";
import { SETTING_KEYS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
import { BlastAllPanel } from "@/components/devices/blast-all-panel";
import { DeliveryLogTable } from "@/components/devices/delivery-log-table";
import type { BlastAllocation } from "@/components/devices/blast-shared";

export const metadata: Metadata = { title: "Perangkat" };

/**
 * Device management and blast console for the signed-in operator.
 *
 * Every figure is read server-side from authoritative rows: allocation counts
 * from recipient/target aggregates and per-device progress from recipient states.
 * Only the caller's own devices are listed, numbers are masked by the device
 * service, and target numbers are never projected (RULES.md §6, §8, §11).
 */
export default async function DevicesPage() {
  const actor = await requireUser();

  const [devices, allocations, deviceStatuses, logs, maxDevices, pairCodeEnabled] =
    await Promise.all([
      listUserDevices(actor.id),
      listCampaignsForUser(actor.id),
      listDeviceBlastStatus(actor.id),
      listUserDeliveryLog({ userId: actor.id }),
      getSetting(SETTING_KEYS.maxDevicesPerUser),
      getSetting(SETTING_KEYS.pairCodeEnabled),
    ]);

  const atCapacity = devices.length >= maxDevices;
  const connected = devices.filter((d) => d.status === "CONNECTED").length;

  // Aggregate allocation: the smaller of remaining quota and unclaimed targets
  // per allocation, summed. This is the only allocation figure a USER may see.
  const allocationLeft = remainingAllocation(allocations);
  const allocationTotal = allocations.reduce(
    (total, allocation) => total + allocation.quotaPerUser,
    0,
  );
  const allocationUsed = Math.max(allocationTotal - allocationLeft, 0);
  const allocationPercent =
    allocationTotal === 0
      ? 0
      : Math.min(100, Math.round((allocationUsed / allocationTotal) * 100));

  const blastAllocations: BlastAllocation[] = allocations
    .filter((allocation) => allocation.startable)
    .map((allocation) => ({
      id: allocation.id,
      name: allocation.name,
      allowedSpeeds: allocation.allowedSpeeds,
      requireTermsAccept: allocation.requireTermsAccept,
      remaining: Math.min(
        allocation.quotaRemaining,
        allocation.targetAvailable,
      ),
    }));

  const statusByDevice = new Map(
    deviceStatuses.map((status) => [status.deviceId, status]),
  );

  const totals = deviceStatuses.reduce(
    (sum, status) => ({
      sent: sum.sent + status.sent,
      failed: sum.failed + status.failed,
      pending: sum.pending + status.pending,
    }),
    { sent: 0, failed: 0, pending: 0 },
  );

  return (
    <>
      <PageHeader
        icon={<Smartphone className="size-5" />}
        title="Perangkat"
        description={`Hubungkan hingga ${maxDevices} perangkat WhatsApp, lalu jalankan blast ke nomor yang dialokasikan admin.`}
        actions={
          <Badge variant={atCapacity ? "warning" : "success"}>
            {connected} dari {maxDevices} device terhubung
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
                Terkirim
              </p>
              <p className="mt-1 text-sm font-black uppercase">
                {totals.sent} pesan
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
                Menunggu
              </p>
              <p className="mt-1 text-sm font-black uppercase">
                {totals.pending} pesan
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
                Gagal / error
              </p>
              <p className="mt-1 text-sm font-black uppercase">
                {totals.failed} pesan
              </p>
            </div>
          </div>
        </div>
      </div>

      <PageSections>
        <SectionCard
          title="Alokasi nomor"
          description="Jumlah nomor yang masih bisa Anda kirimi. Nomor sendiri dikelola admin dan tidak ditampilkan."
          icon={<ListChecks className="size-5" />}
          tone="info"
        >
          <div className="space-y-3">
            <p className="text-2xl font-black leading-none tracking-tighter">
              Alokasi nomor tersisa: {allocationLeft}
            </p>
            <Progress
              value={allocationPercent}
              tone={allocationLeft === 0 ? "warning" : "info"}
              aria-label="Alokasi nomor terpakai"
            />
            <p className="text-xs font-bold uppercase text-foreground">
              {allocationUsed} dari {allocationTotal} kuota terpakai ·{" "}
              {allocations.length} alokasi aktif
            </p>
          </div>
        </SectionCard>

        <SectionCard
          title="Blast semua perangkat"
          description="Menjalankan satu pekerjaan blast pada setiap perangkat yang terhubung."
          icon={<Radio className="size-5" />}
          tone="primary"
        >
          <BlastAllPanel
            allocations={blastAllocations}
            connectedCount={connected}
            maxDevices={maxDevices}
          />
        </SectionCard>

        <SectionCard
          title="Tambah perangkat"
          description={
            atCapacity
              ? `Batas ${maxDevices} perangkat sudah tercapai. Hapus satu perangkat untuk menambah yang baru.`
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
            description="Tambahkan perangkat di atas, lalu hubungkan ke WhatsApp untuk menjalankan blast yang dialokasikan admin."
          />
        ) : (
          <Stagger className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {devices.map((device) => {
              const status = statusByDevice.get(device.id);

              return (
                <StaggerItem key={device.id}>
                  <DeviceCard
                    pairCodeEnabled={pairCodeEnabled}
                    allocations={blastAllocations}
                    progress={{
                      jobId: status?.jobId ?? null,
                      jobStatus: status?.jobStatus ?? null,
                      allowUserPause: status?.allowUserPause ?? false,
                      quotaTotal: status?.quotaTotal ?? 0,
                      sent: status?.sent ?? 0,
                      failed: status?.failed ?? 0,
                      pending: status?.pending ?? 0,
                      percent: status?.percent ?? 0,
                    }}
                    device={{
                      id: device.id,
                      publicId: device.publicId,
                      label: device.label,
                      status: device.status,
                      maskedNumber: device.maskedNumber,
                      lastConnectedAt:
                        device.lastConnectedAt?.toISOString() ?? null,
                      lastErrorCode: device.lastErrorCode,
                    }}
                  />
                </StaggerItem>
              );
            })}
          </Stagger>
        )}

        <SectionCard
          title="Log pengiriman"
          description="Riwayat 24 jam terakhir milik Anda. Nomor penerima tidak pernah ditampilkan."
          icon={<ScrollText className="size-5" />}
        >
          <DeliveryLogTable
            rows={logs.map((row) => ({
              id: row.id,
              createdAt: row.createdAt
                .toISOString()
                .slice(0, 19)
                .replace("T", " "),
              devicePublicId: row.devicePublicId,
              deviceLabel: row.deviceLabel,
              recipientRef: row.recipientRef,
              status: row.status,
              event: row.event,
              detail: row.detail,
              messageType: row.messageType,
              speedSeconds: row.speedSeconds,
            }))}
          />
        </SectionCard>
      </PageSections>
    </>
  );
}
