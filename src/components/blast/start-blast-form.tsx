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

const initialState: BlastActionState = { status: "idle" };

export type StartBlastDevice = { id: string; label: string };

/**
 * Start-blast form.
 *
 * The client picks only a device and a speed from the server-provided allow
 * lists; payout, content and quota are resolved server-side (RULES.md §11).
 */
export function StartBlastForm({
  campaignId,
  devices,
  allowedSpeeds,
  requireTermsAccept,
  disabled,
  disabledReason,
}: {
  campaignId: string;
  devices: StartBlastDevice[];
  allowedSpeeds: number[];
  requireTermsAccept: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [state, formAction, pending] = useActionState(
    startBlastAction,
    initialState,
  );
  const [speed, setSpeed] = useState(allowedSpeeds[0] ?? 3);
  const [accepted, setAccepted] = useState(!requireTermsAccept);

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
    }
  }, [state]);

  if (devices.length === 0) {
    return (
      <p className="border-2 border-black bg-surface px-2 py-1 text-xs font-black uppercase text-foreground">
        Connect a device before starting a job.
      </p>
    );
  }

  const blocked = Boolean(disabled) || (requireTermsAccept && !accepted);

  return (
    <form action={formAction} className="space-y-3">
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
        <Label htmlFor={`device-${campaignId}`}>Device</Label>
        <select
          id={`device-${campaignId}`}
          name="deviceId"
          required
          disabled={pending || disabled}
          className="flex h-11 w-full border-4 border-black bg-background px-3 font-mono text-sm font-bold uppercase disabled:bg-surface-strong"
        >
          {devices.map((device) => (
            <option key={device.id} value={device.id}>
              {device.label}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="space-y-2" disabled={pending || disabled}>
        <legend className="text-xs font-black uppercase tracking-widest">
          Sending speed
        </legend>
        <div className="flex flex-wrap gap-2">
          {allowedSpeeds.map((option) => (
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
          One message every {speed} second{speed === 1 ? "" : "s"}.
        </p>
      </fieldset>

      {requireTermsAccept ? (
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
            I confirm these recipients have consented to receive this message.
          </span>
        </label>
      ) : null}

      <Button type="submit" loading={pending} disabled={blocked}>
        <Rocket aria-hidden="true" />
        Start blast
      </Button>

      {disabled && disabledReason ? (
        <p className="border-2 border-black bg-warning px-2 py-1 text-xs font-black uppercase text-warning-foreground">
          {disabledReason}
        </p>
      ) : null}
    </form>
  );
}
