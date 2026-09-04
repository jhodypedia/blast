"use client";

import { useActionState, useEffect, useState } from "react";
import {
  Check,
  Link2Off,
  RefreshCw,
  Smartphone,
  Trash2,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

import {
  deviceControlAction,
  type DeviceActionState,
} from "@/app/actions/devices";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DevicePairingModal } from "@/components/devices/device-pairing-modal";

export type DeviceCardData = {
  id: string;
  label: string;
  status: "CONNECTING" | "CONNECTED" | "DISCONNECTED" | "EXPIRED" | "ERROR";
  maskedNumber: string | null;
  lastConnectedAt: string | null;
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
 * One device row with its pairing and lifecycle controls.
 *
 * The QR image and pairing code are never rendered from props: they arrive over
 * the authenticated status channel only (RULES.md §8).
 */
export function DeviceCard({
  device,
  pairCodeEnabled,
}: {
  device: DeviceCardData;
  pairCodeEnabled: boolean;
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
            <Badge variant={STATUS_VARIANT[device.status]}>
              {STATUS_LABEL[device.status]}
            </Badge>
          </div>

          {device.status !== "CONNECTED" ? (
            <Button type="button" className="w-full" onClick={() => setPairingOpen(true)} disabled={busy}>
              Hubungkan perangkat
            </Button>
          ) : (
            <div className="flex items-center gap-2 border-4 border-black bg-success px-3 py-2 text-xs font-black uppercase text-success-foreground">
              <Check className="size-4" aria-hidden="true" /> Perangkat siap menjalankan blast
            </div>
          )}

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

