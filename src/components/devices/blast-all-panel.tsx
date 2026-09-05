"use client";

import { useActionState, useEffect, useState } from "react";
import { AlertCircle, Radio } from "lucide-react";
import { toast } from "sonner";

import {
  startBlastAllDevicesAction,
  type BlastActionState,
} from "@/app/actions/blast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  ConsentCheckbox,
  SpeedPicker,
  type BlastAllocation,
} from "@/components/devices/blast-shared";

const initialState: BlastActionState = { status: "idle" };

/**
 * Bulk blast: one job per connected device of the caller.
 *
 * The device set is resolved from the verified session server-side, so this form
 * only carries an allocation id and a delay from the server-provided allow lists
 * (RULES.md §11, §13).
 */
export function BlastAllPanel({
  allocations,
  connectedCount,
  maxDevices,
  disabled,
  disabledReason,
}: {
  allocations: BlastAllocation[];
  connectedCount: number;
  maxDevices: number;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [state, formAction, pending] = useActionState(
    startBlastAllDevicesAction,
    initialState,
  );
  const [campaignId, setCampaignId] = useState(allocations[0]?.id ?? "");
  const allocation =
    allocations.find((item) => item.id === campaignId) ?? allocations[0];
  const [speed, setSpeed] = useState(allocation?.allowedSpeeds[0] ?? 3);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
    }
  }, [state]);

  if (allocations.length === 0) {
    return (
      <p className="border-2 border-black bg-surface px-2 py-1 text-xs font-black uppercase text-foreground">
        Belum ada alokasi nomor untuk akun Anda. Hubungi admin.
      </p>
    );
  }

  const requireTerms = allocation?.requireTermsAccept ?? false;
  const blocked =
    Boolean(disabled) || connectedCount === 0 || (requireTerms && !accepted);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="speedSeconds" value={speed} />

      {state.status === "error" ? (
        <div
          role="alert"
          className="flex items-start gap-2 border-4 border-black bg-destructive p-3 text-sm font-bold text-destructive-foreground"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{state.message}</span>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="blast-all-allocation">Alokasi nomor</Label>
        <select
          id="blast-all-allocation"
          value={campaignId}
          onChange={(event) => {
            const next = event.target.value;
            setCampaignId(next);
            const nextAllocation = allocations.find(
              (item) => item.id === next,
            );
            setSpeed(nextAllocation?.allowedSpeeds[0] ?? 3);
            setAccepted(false);
          }}
          disabled={pending || disabled}
          className="flex h-11 w-full border-4 border-black bg-background px-3 font-mono text-sm font-bold uppercase disabled:bg-surface-strong"
        >
          {allocations.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.remaining} nomor tersisa
            </option>
          ))}
        </select>
      </div>

      <SpeedPicker
        id="blast-all-speed"
        speeds={allocation?.allowedSpeeds ?? []}
        value={speed}
        onChange={setSpeed}
        disabled={pending || disabled}
      />

      {requireTerms ? (
        <ConsentCheckbox
          checked={accepted}
          onChange={setAccepted}
          disabled={pending || disabled}
        />
      ) : null}

      <Button type="submit" loading={pending} disabled={blocked}>
        <Radio aria-hidden="true" />
        Blast semua perangkat
      </Button>

      {connectedCount === 0 ? (
        <p className="border-2 border-black bg-warning px-2 py-1 text-xs font-black uppercase text-warning-foreground">
          Hubungkan minimal satu perangkat sebelum memulai blast.
        </p>
      ) : disabled && disabledReason ? (
        <p className="border-2 border-black bg-warning px-2 py-1 text-xs font-black uppercase text-warning-foreground">
          {disabledReason}
        </p>
      ) : (
        <p className="text-xs font-bold uppercase text-foreground">
          {connectedCount} dari {maxDevices} perangkat terhubung akan mengirim.
        </p>
      )}
    </form>
  );
}
