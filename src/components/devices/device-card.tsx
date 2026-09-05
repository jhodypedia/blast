"use client";

import { useActionState, useEffect, useState } from "react";
import {
  Activity,
  Check,
  Fingerprint,
  Link2Off,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Trash2,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

import {
  deviceControlAction,
  type DeviceActionState,
} from "@/app/actions/devices";
import { SHADOW_BAN_ERROR_CODE } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { DevicePairingModal } from "@/components/devices/device-pairing-modal";
import { DeviceBlastForm } from "@/components/devices/device-blast-form";
import { JobControls } from "@/components/devices/job-controls";
import type { BlastAllocation } from "@/components/devices/blast-shared";

export type DeviceCardData = {
  id: string;
  /** Operator-visible `device-{userId}-{uuid}` identifier. */
  publicId: string;
  label: string;
  status: "CONNECTING" | "CONNECTED" | "DISCONNECTED" | "EXPIRED" | "ERROR";
  maskedNumber: string | null;
  lastConnectedAt: string | null;
  lastErrorCode: string | null;
};

/** Authoritative per-device delivery counters from recipient rows. */
export type DeviceBlastProgress = {
  jobId: string | null;
  jobStatus:
    | "PENDING"
    | "QUEUED"
    | "RUNNING"
    | "PAUSED"
    | "COMPLETED"
    | "PARTIAL_FAILED"
    | "CANCELLED"
    | "FAILED"
    | null;
  quotaTotal: number;
  sent: number;
  failed: number;
  pending: number;
  percent: number;
  allowUserPause: boolean;
};

const initialState: DeviceActionState = { status: "idle" };

const STATUS_VARIANT: Record<
  DeviceCardData["status"],
  "success" | "warning" | "danger" | "neutral"
> = {
  CONNECTED: "success",
  CONNECTING: "warning",
  DISCONNECTED: "neutral",
  EXPIRED: "warning",
  ERROR: "danger",
};

const STATUS_LABEL: Record<DeviceCardData["status"], string> = {
  CONNECTED: "Terhubung",
  CONNECTING: "Menghubungkan",
  DISCONNECTED: "Terputus",
  EXPIRED: "Kedaluwarsa",
  ERROR: "Kesalahan",
};

/**
 * One device row with its pairing, blast and lifecycle controls.
 *
 * The QR image and pairing code are never rendered from props: they arrive over
 * the authenticated status channel only (RULES.md §8). Blast progress comes from
 * authoritative recipient counts passed in by the server, never from a local
 * counter (RULES.md §13).
 */
export function DeviceCard({
  device,
  pairCodeEnabled,
  allocations,
  progress,
}: {
  device: DeviceCardData;
  pairCodeEnabled: boolean;
  allocations: BlastAllocation[];
  progress: DeviceBlastProgress;
}) {
  const [controlState, controlAction, controlPending] = useActionState(
    deviceControlAction,
    initialState,
  );
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pairingOpen, setPairingOpen] = useState(false);

  useEffect(() => {
    if (controlState.status === "success") {
      toast.success(controlState.message);
    }
    if (controlState.status === "error") {
      toast.error(controlState.message);
    }
  }, [controlState]);

  const busy = controlPending;
  const shadowBanned = device.lastErrorCode === SHADOW_BAN_ERROR_CODE;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "linear" }}
    >
      <Card>
        <CardContent className="space-y-5 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center border-4 border-black bg-primary">
                <Smartphone
                  className="size-5 text-primary-foreground"
                  aria-hidden="true"
                />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-black uppercase">
                  {device.label}
                </p>
                <p className="mt-1 truncate text-xs font-bold text-foreground">
                  {device.maskedNumber ?? "Belum terhubung ke WhatsApp"}
                </p>
              </div>
            </div>
            <Badge variant={shadowBanned ? "danger" : STATUS_VARIANT[device.status]}>
              {shadowBanned ? "Shadow ban" : STATUS_LABEL[device.status]}
            </Badge>
          </div>

          <div className="flex items-center gap-2 border-4 border-black bg-surface-strong px-3 py-2">
            <Fingerprint className="size-4 shrink-0 text-info" aria-hidden="true" />
            <span className="shrink-0 text-[0.625rem] font-black uppercase tracking-wide text-foreground">
              ID
            </span>
            <code
              className="min-w-0 flex-1 truncate font-mono text-[0.6875rem] font-bold"
              title={device.publicId}
            >
              {device.publicId}
            </code>
          </div>

          {shadowBanned ? (
            <div className="flex items-start gap-2 border-4 border-black bg-danger px-3 py-2 text-xs font-black uppercase text-danger-foreground">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span className="normal-case">
                WhatsApp membatasi nomor ini, jadi sesi otomatis diputus dan
                dihapus. Kurangi volume pengiriman lalu hubungkan ulang setelah
                nomor kembali normal.
              </span>
            </div>
          ) : null}

          {device.status !== "CONNECTED" ? (
            <Button type="button" className="w-full" onClick={() => setPairingOpen(true)} disabled={busy}>
              Hubungkan perangkat
            </Button>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-4 border-black bg-success px-3 py-2 text-xs font-black uppercase text-success-foreground">
                <Check className="size-4" aria-hidden="true" /> Perangkat siap menjalankan blast
              </div>

              <DeviceBlastForm
                deviceId={device.id}
                allocations={allocations}
                disabled={busy}
              />
            </div>
          )}

          {progress.jobStatus ? (
            <div className="space-y-3 border-4 border-black bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-foreground">
                  <Activity className="size-3.5 text-primary" aria-hidden="true" />
                  Status blast
                </span>
                <Badge
                  variant={
                    progress.jobStatus === "PAUSED"
                      ? "warning"
                      : progress.jobStatus === "FAILED"
                        ? "danger"
                        : progress.jobStatus === "COMPLETED"
                          ? "success"
                          : "info"
                  }
                >
                  {progress.jobStatus}
                </Badge>
              </div>

              <Progress
                value={progress.percent}
                tone={
                  progress.jobStatus === "PAUSED"
                    ? "warning"
                    : progress.jobStatus === "FAILED"
                      ? "danger"
                      : progress.jobStatus === "COMPLETED"
                        ? "success"
                        : "primary"
                }
                aria-label={`Progres pengiriman ${device.label}`}
              />

              <dl className="grid grid-cols-3 gap-2 text-center">
                <Counter
                  label="Sukses"
                  value={progress.sent}
                  className="bg-success text-success-foreground"
                />
                <Counter
                  label="Gagal"
                  value={progress.failed}
                  className="bg-destructive text-destructive-foreground"
                />
                <Counter
                  label="Menunggu"
                  value={progress.pending}
                  className="bg-warning text-warning-foreground"
                />
              </dl>

              <p className="text-xs font-bold uppercase text-foreground">
                {progress.sent}/{progress.quotaTotal} terkirim · {progress.percent}%
              </p>

              {progress.jobId ? (
                <JobControls
                  blastJobId={progress.jobId}
                  status={progress.jobStatus}
                  allowUserPause={progress.allowUserPause}
                />
              ) : null}
            </div>
          ) : null}

          <DeviceControls
            deviceId={device.id}
            connected={device.status === "CONNECTED"}
            action={controlAction}
            onReconnect={() => setPairingOpen(true)}
            pending={controlPending}
            busy={busy}
            confirmRemove={confirmRemove}
            setConfirmRemove={setConfirmRemove}
          />
        </CardContent>
      </Card>
      <DevicePairingModal deviceId={device.id} deviceName={device.label} pairCodeEnabled={pairCodeEnabled} open={pairingOpen} onClose={() => setPairingOpen(false)} />
    </motion.div>
  );
}

/** Small delivery counter tile inside the per-device status panel. */
function Counter({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div className={`border-2 border-black p-2 ${className}`}>
      <dt className="text-[0.625rem] font-black uppercase tracking-widest">
        {label}
      </dt>
      <dd className="mt-0.5 text-base font-black leading-none">{value}</dd>
    </div>
  );
}

/** Disconnect / reconnect / remove controls with an inline remove confirmation. */
function DeviceControls({
  deviceId,
  connected,
  action,
  onReconnect,
  pending,
  busy,
  confirmRemove,
  setConfirmRemove,
}: {
  deviceId: string;
  connected: boolean;
  action: (formData: FormData) => void;
  onReconnect: () => void;
  pending: boolean;
  busy: boolean;
  confirmRemove: boolean;
  setConfirmRemove: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 border-t-4 border-black pt-4">
      <form action={action} onSubmit={() => { if (!connected) onReconnect(); }}>
        <input type="hidden" name="deviceId" value={deviceId} />
        <input
          type="hidden"
          name="action"
          value={connected ? "DISCONNECT" : "RECONNECT"}
        />
        <Button type="submit" variant="outline" size="sm" loading={pending}>
          {connected ? (
            <>
              <Link2Off aria-hidden="true" />
              Putuskan
            </>
          ) : (
            <>
              <RefreshCw aria-hidden="true" />
              Hubungkan ulang
            </>
          )}
        </Button>
      </form>

      {confirmRemove ? (
        <form
          action={action}
          onSubmit={() => setConfirmRemove(false)}
          className="flex items-center gap-2"
        >
          <input type="hidden" name="deviceId" value={deviceId} />
          <input type="hidden" name="action" value="REMOVE" />
              <span className="text-xs font-black uppercase text-foreground">
            Hapus perangkat ini?
          </span>
          <Button
            type="submit"
            variant="destructive"
            size="sm"
            loading={pending}
          >
            Konfirmasi
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setConfirmRemove(false)}
          >
            Batal
          </Button>
        </form>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setConfirmRemove(true)}
          disabled={busy}
        >
          <Trash2 aria-hidden="true" />
          Hapus
        </Button>
      )}
    </div>
  );
}

