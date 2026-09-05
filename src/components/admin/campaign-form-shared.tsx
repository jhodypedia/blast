"use client";

import { Label } from "@/components/ui/label";

/** Shared campaign form primitives and types. */

export const SPEED_OPTIONS = [1, 3, 6, 10];

/** Maximum images and buttons in one content block (mirrors the Zod schema). */
export const MAX_CONTENT_IMAGES = 2;
export const MAX_CONTENT_BUTTONS = 3;

/** Interactive button variants an admin may attach to the content block. */
export const BUTTON_VARIANT_OPTIONS = [
  {
    value: "URL",
    label: "Buka tautan",
    valueLabel: "URL tujuan",
    placeholder: "https://contoh.com/promo",
  },
  {
    value: "REPLY",
    label: "Balasan cepat",
    valueLabel: "Tidak perlu diisi",
    placeholder: "",
  },
  {
    value: "COPY",
    label: "Salin kode",
    valueLabel: "Kode yang disalin",
    placeholder: "PROMO2026",
  },
  {
    value: "CALL",
    label: "Telepon",
    valueLabel: "Nomor telepon",
    placeholder: "+628123456789",
  },
] as const satisfies ReadonlyArray<{
  value: ButtonVariantValue;
  label: string;
  valueLabel: string;
  placeholder: string;
}>;

export type ButtonVariantValue = "URL" | "REPLY" | "COPY" | "CALL";

/**
 * Message shape stored on an allocation.
 *
 * `RICH` is the unified content block every new allocation uses. The three legacy
 * values still exist on older rows and are shown read-only in the summary.
 */
export type MessageTypeValue = "TEXT" | "IMAGE" | "BUTTON" | "RICH";

export type ContentButtonValue = {
  variant: ButtonVariantValue;
  label: string;
  value: string;
};

export type CampaignFormOption = { id: string; label: string };

export type CampaignFormValues = {
  id?: string;
  name: string;
  description: string;
  internalNotes: string;
  /** Shape stored on the row; new saves always submit `RICH`. */
  messageType: MessageTypeValue;
  messageText: string;
  /** Unified content block. */
  image1Key: string;
  image1Mime: string;
  image2Key: string;
  image2Mime: string;
  buttons: ContentButtonValue[];
  /** Legacy content, still submitted so an older row keeps its data. */
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
