"use client";

import { useActionState, useEffect, useState } from "react";
import { AlertCircle, ImagePlus, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  createCampaignAction,
  updateCampaignAction,
  type AdminActionState,
} from "@/app/actions/admin-campaigns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CampaignDeliveryFields } from "@/components/admin/campaign-delivery-fields";
import { ContentBlockPreview } from "@/components/admin/content-block-preview";
import {
  BUTTON_VARIANT_OPTIONS,
  Field,
  MAX_CONTENT_BUTTONS,
  type CampaignFormOption,
  type CampaignFormValues,
  type ContentButtonValue,
} from "@/components/admin/campaign-form-shared";

const initialState: AdminActionState = { status: "idle" };

/**
 * Allocation create / edit form — ADMIN only.
 *
 * Backs the Baileys configuration on Target Nomor. Content is one unified block —
 * up to two images, the message text and up to three buttons — delivered as a
 * single WhatsApp message, so there is no message-type choice to get wrong. The
 * same Zod schema validates this payload on the server, and payout, currency and
 * target list are frozen there once recipients exist (RULES.md §6).
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
  // Local editing state for the live preview and the button rows. The server
  // re-derives everything from the submitted FormData, so none of this is trusted.
  const [messageText, setMessageText] = useState(values.messageText);
  const [buttons, setButtons] = useState<ContentButtonValue[]>(values.buttons);
  const [images, setImages] = useState({
    image1Key: values.image1Key,
    image2Key: values.image2Key,
  });

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
    }
  }, [state]);

  const fieldError = (field: string): string | undefined =>
    state.status === "error" ? state.fieldErrors?.[field]?.[0] : undefined;

  const updateButton = (index: number, patch: Partial<ContentButtonValue>) => {
    setButtons((current) =>
      current.map((button, position) =>
        position === index ? { ...button, ...patch } : button,
      ),
    );
  };

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {values.id ? (
        <input type="hidden" name="campaignId" value={values.id} />
      ) : null}
      {/* New saves always store the unified block; legacy shapes are read-only. */}
      <input type="hidden" name="messageType" value="RICH" />
      {/* Legacy columns travel unchanged so an older row keeps its data. */}
      <input type="hidden" name="mediaKey" value={values.mediaKey} />
      <input type="hidden" name="mediaMime" value={values.mediaMime} />
      <input type="hidden" name="mediaCaption" value={values.mediaCaption} />
      <input type="hidden" name="ctaLabel" value={values.ctaLabel} />
      <input type="hidden" name="ctaUrl" value={values.ctaUrl} />

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
          Konten pesan
        </legend>

        <p className="border-4 border-black bg-surface p-3 text-xs font-bold uppercase leading-snug">
          Satu blok konten dikirim sebagai satu pesan WhatsApp: maksimal 2 gambar,
          isi pesan, dan maksimal {MAX_CONTENT_BUTTONS} tombol.
        </p>

        <Field
          id="messageText"
          label="Isi pesan"
          error={fieldError("messageText")}
        >
          <textarea
            id="messageText"
            name="messageText"
            required
            maxLength={4096}
            rows={5}
            value={messageText}
            onChange={(event) => setMessageText(event.target.value)}
            className="w-full border-4 border-black bg-background p-3 font-mono text-sm"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          {([1, 2] as const).map((slot) => {
            const keyField = slot === 1 ? "image1Key" : "image2Key";
            const mimeField = slot === 1 ? "image1Mime" : "image2Mime";
            const currentKey = images[keyField];
            const currentMime =
              slot === 1 ? values.image1Mime : values.image2Mime;

            return (
              <div key={slot} className="space-y-2">
                {/* The existing key/mime survive an edit that does not re-upload. */}
                <input type="hidden" name={keyField} value={currentKey} />
                <input type="hidden" name={mimeField} value={currentMime} />

                <Field
                  id={`image${slot}File`}
                  label={
                    currentKey
                      ? `Ganti gambar ${slot}`
                      : `Unggah gambar ${slot} (opsional)`
                  }
                  error={fieldError(`image${slot}File`) ?? fieldError(keyField)}
                >
                  <Input
                    id={`image${slot}File`}
                    name={`image${slot}File`}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                  />
                </Field>

                {currentKey ? (
                  <label className="flex min-h-11 items-center gap-2 border-4 border-black bg-background px-3 text-xs font-black uppercase">
                    <input
                      type="checkbox"
                      name={`image${slot}Clear`}
                      className="size-4 border-2 border-black accent-primary"
                      onChange={(event) =>
                        setImages((current) => ({
                          ...current,
                          [keyField]: event.target.checked ? "" : currentKey,
                        }))
                      }
                    />
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Hapus gambar {slot}
                  </label>
                ) : (
                  <p className="flex items-center gap-1.5 text-xs font-bold uppercase text-foreground">
                    <ImagePlus className="size-3.5" aria-hidden="true" />
                    JPG, PNG, atau WebP
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-2">
          <span className="text-xs font-black uppercase tracking-widest">
            Tombol ({buttons.length}/{MAX_CONTENT_BUTTONS})
          </span>

          {buttons.map((button, index) => {
            const variant =
              BUTTON_VARIANT_OPTIONS.find(
                (option) => option.value === button.variant,
              ) ?? BUTTON_VARIANT_OPTIONS[0];

            return (
              <div
                key={index}
                className="space-y-3 border-4 border-black bg-surface p-3"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    id={`buttonVariant-${index}`}
                    label="Jenis tombol"
                    error={fieldError(`buttons.${index}.variant`)}
                  >
                    <select
                      id={`buttonVariant-${index}`}
                      name="buttonVariant"
                      value={button.variant}
                      onChange={(event) =>
                        updateButton(index, {
                          variant: event.target
                            .value as ContentButtonValue["variant"],
                        })
                      }
                      className="min-h-11 w-full border-4 border-black bg-background px-3 text-sm font-bold"
                    >
                      {BUTTON_VARIANT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field
                    id={`buttonLabel-${index}`}
                    label="Label tombol"
                    error={fieldError(`buttons.${index}.label`)}
                  >
                    <Input
                      id={`buttonLabel-${index}`}
                      name="buttonLabel"
                      maxLength={64}
                      value={button.label}
                      onChange={(event) =>
                        updateButton(index, { label: event.target.value })
                      }
                      placeholder="Lihat detail"
                    />
                  </Field>
                </div>

                <Field
                  id={`buttonValue-${index}`}
                  label={variant.valueLabel}
                  error={fieldError(`buttons.${index}.value`)}
                >
                  <Input
                    id={`buttonValue-${index}`}
                    name="buttonValue"
                    maxLength={2048}
                    value={button.value}
                    onChange={(event) =>
                      updateButton(index, { value: event.target.value })
                    }
                    placeholder={variant.placeholder}
                    readOnly={button.variant === "REPLY"}
                  />
                </Field>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setButtons((current) =>
                      current.filter((_, position) => position !== index),
                    )
                  }
                >
                  <Trash2 aria-hidden="true" />
                  Hapus tombol
                </Button>
              </div>
            );
          })}

          {buttons.length < MAX_CONTENT_BUTTONS ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setButtons((current) => [
                  ...current,
                  { variant: "URL", label: "", value: "" },
                ])
              }
            >
              <Plus aria-hidden="true" />
              Tambah tombol
            </Button>
          ) : null}

          {fieldError("buttons") ? (
            <p
              role="alert"
              className="border-2 border-black bg-destructive px-2 py-1 text-xs font-black uppercase text-destructive-foreground"
            >
              {fieldError("buttons")}
            </p>
          ) : null}
        </div>

        <ContentBlockPreview
          messageText={messageText}
          image1Key={images.image1Key}
          image2Key={images.image2Key}
          buttons={buttons}
        />
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
