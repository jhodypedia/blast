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

const initialState: BlastActionState = { status: "idle" };

export type BlastAllCampaign = {
  id: string;
  name: string;
  allowedSpeeds: number[];
  requireTermsAccept: boolean;
};

/**
 * Bulk start: one job per connected device.
 *
 * The device set is resolved from the session server-side, so this form only
 * carries a campaign and a speed from the server-provided allow lists
 * (RULES.md §11, §13).
 */
export function BlastAllForm({
  campaigns,
  connectedCount,
  disabled,
  disabledReason,
}: {
  campaigns: BlastAllCampaign[];
  connectedCount: number;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [state, formAction, pending] = useActionState(
    startBlastAllDevicesAction,
    initialState,
  );
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const campaign =
    campaigns.find((item) => item.id === campaignId) ?? campaigns[0];
  const [speed, setSpeed] = useState(campaign?.allowedSpeeds[0] ?? 3);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
    }
  }, [state]);

  if (campaigns.length === 0) {
    return (
      <p className="border-2 border-black bg-surface px-2 py-1 text-xs font-black uppercase text-foreground">
        Belum ada campaign yang ditugaskan ke akun Anda.
      </p>
    );
  }

  const speeds = campaign?.allowedSpeeds ?? [];
  const requireTerms = campaign?.requireTermsAccept ?? false;
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
        <Label htmlFor="blast-all-campaign">Campaign</Label>
        <select
          id="blast-all-campaign"
          value={campaignId}
          onChange={(event) => {
            const next = event.target.value;
            setCampaignId(next);
            const nextSpeeds =
              campaigns.find((item) => item.id === next)?.allowedSpeeds ?? [];
            setSpeed(nextSpeeds[0] ?? 3);
            setAccepted(false);
          }}
          disabled={pending || disabled}
          className="flex h-11 w-full border-4 border-black bg-background px-3 font-mono text-sm font-bold uppercase disabled:bg-surface-strong"
        >
          {campaigns.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="space-y-2" disabled={pending || disabled}>
        <legend className="text-xs font-black uppercase tracking-widest">
          Kecepatan kirim
        </legend>
        <div className="flex flex-wrap gap-2">
          {speeds.map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={option === speed ? "default" : "outline"}
              aria-pressed={option === speed}
              onClick={() => setSpeed(option)}
            >
              {option}s
            </Button>
          ))}
        </div>
        <p className="text-xs font-bold uppercase text-foreground">
          Satu pesan setiap {speed} detik per perangkat.
        </p>
      </fieldset>

      {requireTerms ? (
        <label className="flex min-h-11 items-start gap-2 border-2 border-black bg-surface p-2 text-xs font-bold text-foreground">
          <input
            type="checkbox"
            name="acceptedTerms"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            className="mt-0.5 size-4 border-2 border-black accent-primary"
            disabled={pending || disabled}
          />
          <span>
            Saya memastikan penerima sudah menyetujui menerima pesan ini.
          </span>
        </label>
      ) : null}

      <Button type="submit" loading={pending} disabled={blocked}>
        <Radio aria-hidden="true" />
        Blast All Devices
      </Button>

      {connectedCount === 0 ? (
        <p className="border-2 border-black bg-warning px-2 py-1 text-xs font-black uppercase text-warning-foreground">
          Hubungkan minimal satu perangkat sebelum memulai blast.
        </p>
      ) : disabled && disabledReason ? (
        <p className="border-2 border-black bg-warning px-2 py-1 text-xs font-black uppercase text-warning-foreground">
          {disabledReason}
        </p>
      ) : null}
    </form>
  );
}
