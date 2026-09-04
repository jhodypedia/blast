"use client";

import { useActionState, useEffect, useState } from "react";
import { AlertCircle, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  createDeviceAction,
  type DeviceActionState,
} from "@/app/actions/devices";
import { Button } from "@/components/ui/button";
import { DevicePairingModal } from "@/components/devices/device-pairing-modal";

const initialState: DeviceActionState = { status: "idle" };

/**
 * Adds a device slot. The per-user cap is enforced server-side inside a
 * serialisable transaction, so this form never needs to know the limit.
 */
export function AddDeviceForm({ disabled }: { disabled?: boolean }) {
  const [state, formAction, pending] = useActionState(
    createDeviceAction,
    initialState,
  );
  const [pairingDeviceId, setPairingDeviceId] = useState<string | null>(null);

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      if (state.deviceId) {
        const deviceId = state.deviceId;
        window.setTimeout(() => setPairingDeviceId(deviceId), 0);
      }
    }
  }, [state]);

  return (
    <>
      <form action={formAction} className="space-y-3" noValidate>
      {state.status === "error" ? (
        <div
          role="alert"
          className="flex items-start gap-2 border-4 border-black bg-destructive p-3 text-sm font-bold text-destructive-foreground"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{state.message}</span>
        </div>
      ) : null}

      <p className="text-sm font-bold text-foreground">
        Nama dan ID perangkat dibuat otomatis setelah slot berhasil dibuat.
      </p>
      <Button type="submit" loading={pending} disabled={disabled}>
        <Plus aria-hidden="true" />
        Tambah perangkat
      </Button>
      </form>
      <DevicePairingModal deviceId={pairingDeviceId ?? ""} deviceName="Perangkat baru" open={Boolean(pairingDeviceId)} onClose={() => setPairingDeviceId(null)} />
    </>
  );
}
