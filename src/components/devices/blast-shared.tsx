"use client";

import { Label } from "@/components/ui/label";

/** Shared types and primitives for the Device page blast controls. */

/**
 * One admin-configured allocation as an operator may see it.
 *
 * Deliberately narrow: no target numbers, no message content, no payout policy
 * beyond what the operator needs to pick a delay (RULES.md §6).
 */
export type BlastAllocation = {
  id: string;
  name: string;
  /** Delays the admin permits for this allocation, in seconds. */
  allowedSpeeds: number[];
  requireTermsAccept: boolean;
  /** Numbers still sendable by this operator. Aggregate only. */
  remaining: number;
};

/** Speed picker shared by the bulk and single-device forms. */
export function SpeedPicker({
  id,
  speeds,
  value,
  onChange,
  disabled,
}: {
  id: string;
  speeds: number[];
  value: number;
  onChange: (speed: number) => void;
  disabled?: boolean;
}) {
  // A single permitted delay is an admin decision, not an operator choice.
  if (speeds.length <= 1) {
    return (
      <p className="border-2 border-black bg-surface px-2 py-1 text-xs font-black uppercase text-foreground">
        Kecepatan ditetapkan admin: satu pesan / {speeds[0] ?? value} detik
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Kecepatan kirim</Label>
      <div id={id} className="flex flex-wrap gap-2" role="group">
        {speeds.map((speed) => (
          <button
            key={speed}
            type="button"
            disabled={disabled}
            aria-pressed={speed === value}
            onClick={() => onChange(speed)}
            className={`min-h-11 min-w-11 border-4 border-black px-3 text-sm font-black uppercase disabled:opacity-60 ${
              speed === value
                ? "bg-primary text-primary-foreground"
                : "bg-background text-foreground hover:bg-accent"
            }`}
          >
            {speed}s
          </button>
        ))}
      </div>
      <p className="text-xs font-bold uppercase text-foreground">
        Satu pesan setiap {value} detik per perangkat.
      </p>
    </div>
  );
}

/** Consent confirmation shown only when the allocation requires it. */
export function ConsentCheckbox({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-h-11 items-start gap-2 border-2 border-black bg-surface p-2 text-xs font-bold text-foreground">
      <input
        type="checkbox"
        name="acceptedTerms"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 border-2 border-black accent-primary"
        disabled={disabled}
      />
      <span>Saya memastikan penerima sudah menyetujui menerima pesan ini.</span>
    </label>
  );
}
