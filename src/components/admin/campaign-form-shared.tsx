"use client";

import { Label } from "@/components/ui/label";

/** Shared campaign form primitives and types. */

export const SPEED_OPTIONS = [1, 3, 6, 10];

/** Baileys message shapes an admin may configure for an allocation. */
export const MESSAGE_TYPE_OPTIONS = [
  {
    value: "TEXT",
    label: "Teks saja",
    hint: "Hanya isi pesan, tanpa gambar atau tombol.",
  },
  {
    value: "IMAGE",
    label: "Pesan dengan gambar",
    hint: "Perlu unggahan gambar. Isi pesan dipakai sebagai caption.",
  },
  {
    value: "BUTTON",
    label: "Pesan dengan tombol",
    hint: "Perlu label dan URL tombol call-to-action.",
  },
] as const satisfies ReadonlyArray<{
  value: MessageTypeValue;
  label: string;
  hint: string;
}>;

export type MessageTypeValue = "TEXT" | "IMAGE" | "BUTTON";

export type CampaignFormOption = { id: string; label: string };

export type CampaignFormValues = {
  id?: string;
  name: string;
  description: string;
  internalNotes: string;
  /** Discriminates which content fields the sender uses. */
  messageType: MessageTypeValue;
  messageText: string;
  mediaKey: string;
  mediaMime: string;
  mediaCaption: string;
  ctaLabel: string;
  ctaUrl: string;
  targetListId: string;
  deviceModePolicy: "SINGLE_DEVICE" | "ALL_DEVICES";
  allowedSpeeds: number[];
  payoutPerSend: string;
  currency: string;
  quotaPerUser: number;
  maxConcurrentJobs: number;
  assignmentPolicy: "ALL_ELIGIBLE" | "SELECTED_USERS";
  assignedUserIds: string[];
  allowUserPause: boolean;
  requireTermsAccept: boolean;
  retryLimit: number;
  scheduledStartAt: string;
  scheduledEndAt: string;
};

/** Labelled field wrapper with an accessible inline error. */
export function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p
          role="alert"
          className="border-2 border-black bg-destructive px-2 py-1 text-xs font-black uppercase text-destructive-foreground"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
