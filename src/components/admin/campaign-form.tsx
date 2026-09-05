"use client";

import { useActionState, useEffect, useState } from "react";
import { AlertCircle, Save } from "lucide-react";
import { toast } from "sonner";

import {
  createCampaignAction,
  updateCampaignAction,
  type AdminActionState,
} from "@/app/actions/admin-campaigns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CampaignDeliveryFields } from "@/components/admin/campaign-delivery-fields";
import {
  Field,
  MESSAGE_TYPE_OPTIONS,
  type CampaignFormOption,
  type CampaignFormValues,
  type MessageTypeValue,
} from "@/components/admin/campaign-form-shared";

const initialState: AdminActionState = { status: "idle" };

/**
 * Allocation create / edit form — ADMIN only.
 *
 * Backs the Baileys configuration on Target Nomor: message type, body, image,
 * CTA, allowed delays, per-operator allocation and schedule. The same Zod schema
 * validates this payload on the server, and payout, currency and target list are
 * frozen there once recipients exist (RULES.md §6).
 */
export function CampaignForm({
  values,
  targetLists,
  operators,
  lockEconomics,
}: {
  values: CampaignFormValues;
  targetLists: CampaignFormOption[];
  operators: CampaignFormOption[];
  lockEconomics?: boolean;
}) {
  const isEdit = Boolean(values.id);
  const [state, formAction, pending] = useActionState(
    isEdit ? updateCampaignAction : createCampaignAction,
    initialState,
  );
  const [policy, setPolicy] = useState(values.assignmentPolicy);
  // Drives which content fields are shown and required. The server prunes the
  // fields the chosen type does not use, so switching type cannot leave stale
  // media or a stale CTA on the allocation.
  const [messageType, setMessageType] = useState<MessageTypeValue>(
    values.messageType,
  );

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
    }
  }, [state]);

  const fieldError = (field: string): string | undefined =>
    state.status === "error" ? state.fieldErrors?.[field]?.[0] : undefined;

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {values.id ? (
        <input type="hidden" name="campaignId" value={values.id} />
      ) : null}

      {state.status === "error" ? (
        <div
          role="alert"
          className="flex items-start gap-2 border-4 border-black bg-destructive p-3 text-sm font-bold text-destructive-foreground"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{state.message}</span>
        </div>
      ) : null}

      <fieldset className="space-y-4" disabled={pending}>
        <legend className="text-sm font-black uppercase tracking-widest">
          Basics
        </legend>

        <Field
          id="name"
          label="Nama alokasi"
          error={fieldError("name")}
        >
          <Input id="name" name="name" required maxLength={120} defaultValue={values.name} />
        </Field>

        <Field
          id="description"
          label="Description shown to operators"
          error={fieldError("description")}
        >
          <Input
            id="description"
            name="description"
            required
            maxLength={500}
            defaultValue={values.description}
          />
        </Field>

        <Field
          id="internalNotes"
          label="Internal notes (never shown to operators)"
          error={fieldError("internalNotes")}
        >
          <Input
            id="internalNotes"
            name="internalNotes"
            maxLength={2000}
            defaultValue={values.internalNotes}
          />
        </Field>
      </fieldset>

      <fieldset className="space-y-4" disabled={pending}>
        <legend className="text-sm font-black uppercase tracking-widest">
          Konfigurasi Baileys
        </legend>

        <div className="space-y-2">
          <span className="text-xs font-black uppercase tracking-widest">
            Tipe pesan
          </span>
          <div className="grid gap-2 sm:grid-cols-3">
            {MESSAGE_TYPE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`flex min-h-11 cursor-pointer flex-col justify-center gap-1 border-4 border-black p-3 text-left ${
                  messageType === option.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-foreground"
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-black uppercase">
                  <input
                    type="radio"
                    name="messageType"
                    value={option.value}
                    checked={messageType === option.value}
                    onChange={() => setMessageType(option.value)}
                    className="size-4 border-2 border-black accent-primary"
                  />
                  {option.label}
                </span>
                <span className="text-xs font-bold leading-snug">
                  {option.hint}
                </span>
              </label>
            ))}
          </div>
          {fieldError("messageType") ? (
            <p
              role="alert"
              className="border-2 border-black bg-destructive px-2 py-1 text-xs font-black uppercase text-destructive-foreground"
            >
              {fieldError("messageType")}
            </p>
          ) : null}
        </div>

        <Field
          id="messageText"
          label={
            messageType === "IMAGE" ? "Isi pesan (caption)" : "Isi pesan"
          }
          error={fieldError("messageText")}
        >
          <textarea
            id="messageText"
            name="messageText"
            required
            maxLength={4096}
            rows={5}
            defaultValue={values.messageText}
            className="w-full border-4 border-black bg-background p-3 font-mono text-sm"
          />
        </Field>

        {messageType === "IMAGE" ? (
          <>
            <input type="hidden" name="mediaKey" value={values.mediaKey} />
            <input type="hidden" name="mediaMime" value={values.mediaMime} />
            <Field
              id="mediaFile"
              label={
                values.mediaKey
                  ? "Ganti gambar (biarkan kosong untuk mempertahankan)"
                  : "Unggah gambar"
              }
              error={fieldError("mediaFile") ?? fieldError("mediaKey")}
            >
              <Input
                id="mediaFile"
                name="mediaFile"
                type="file"
                accept="image/jpeg,image/png,image/webp"
              />
            </Field>
            <Field
              id="mediaCaption"
              label="Caption gambar (opsional)"
              error={fieldError("mediaCaption")}
            >
              <Input
                id="mediaCaption"
                name="mediaCaption"
                maxLength={1024}
                defaultValue={values.mediaCaption}
                placeholder="Pesan singkat di bawah gambar"
              />
            </Field>
          </>
        ) : null}

        {messageType === "BUTTON" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="ctaLabel"
              label="Label tombol"
              error={fieldError("ctaLabel")}
            >
              <Input
                id="ctaLabel"
                name="ctaLabel"
                maxLength={64}
                defaultValue={values.ctaLabel}
                placeholder="Lihat detail"
              />
            </Field>
            <Field id="ctaUrl" label="URL tombol" error={fieldError("ctaUrl")}>
              <Input
                id="ctaUrl"
                name="ctaUrl"
                type="url"
                maxLength={2048}
                defaultValue={values.ctaUrl}
                placeholder="https://contoh.com/promo"
              />
            </Field>
          </div>
        ) : null}
      </fieldset>

      <CampaignDeliveryFields
        values={values}
        targetLists={targetLists}
        operators={operators}
        policy={policy}
        setPolicy={setPolicy}
        lockEconomics={lockEconomics}
        pending={pending}
        fieldError={fieldError}
      />

      <Button type="submit" loading={pending}>
        <Save aria-hidden="true" />
        {isEdit ? "Simpan konfigurasi" : "Buat konfigurasi"}
      </Button>
    </form>
  );
}
