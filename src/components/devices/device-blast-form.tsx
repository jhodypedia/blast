"use client";

import { useActionState, useEffect, useState } from "react";
import { AlertCircle, Rocket } from "lucide-react";
import { toast } from "sonner";

import {
  startBlastAction,
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
 * Single-device blast, rendered inside the device card.
 *
 * The operator picks only an allocation and a delay from the server-provided
 * allow lists; message content, targets, payout and quota are resolved
 * server-side from the allocation (RULES.md §11).
 */
export function DeviceBlastForm({
  deviceId,
  allocations,
  disabled,
  disabledReason,
}: {
  deviceId: string;
  allocations: BlastAllocation[];
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [state, formAction, pending] = useActionState(
    startBlastAction,
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
        Belum ada alokasi nomor untuk perangkat ini.
      </p>
    );
  }

  const requireTerms = allocation?.requireTermsAccept ?? false;
  const blocked = Boolean(disabled) || (requireTerms && !accepted);
  const selectId = `device-blast-allocation-${deviceId}`;

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="deviceId" value={deviceId} />
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
        <Label htmlFor={selectId}>Alokasi nomor</Label>
        <select
          id={selectId}
          value={campaignId}
          onChange={(event) => {
            const next = event.target.value;
            setCampaignId(next);
            setSpeed(
              allocations.find((item) => item.id === next)?.allowedSpeeds[0] ??
                3,
            );
            setAccepted(false);
          }}
          disabled={pending || disabled}
          className="flex h-11 w-full border-4 border-black bg-background px-3 font-mono text-sm font-bold uppercase disabled:bg-surface-strong"
        >
          {allocations.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.remaining} tersisa
            </option>
          ))}
        </select>
      </div>

      <SpeedPicker
        id={`device-blast-speed-${deviceId}`}
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

      <Button type="submit" size="sm" loading={pending} disabled={blocked}>
        <Rocket aria-hidden="true" />
        Blast perangkat ini
      </Button>

      {disabled && disabledReason ? (
        <p className="border-2 border-black bg-warning px-2 py-1 text-xs font-black uppercase text-warning-foreground">
          {disabledReason}
        </p>
      ) : null}
    </form>
  );
}
