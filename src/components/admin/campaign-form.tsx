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
  type CampaignFormOption,
  type CampaignFormValues,
} from "@/components/admin/campaign-form-shared";

const initialState: AdminActionState = { status: "idle" };

/**
 * Campaign create / edit form — ADMIN only.
 *
 * The same Zod schema validates this payload on the server, and payout, currency
 * and target list are frozen there once recipients exist (RULES.md §6).
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
          className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{state.message}</span>
        </div>
      ) : null}

      <fieldset className="space-y-4" disabled={pending}>
        <legend className="text-sm font-semibold">Basics</legend>

        <Field
          id="name"
          label="Campaign name"
          error={fieldError("name")}
        >
          <Input id="name" name="name" required maxLength={120} defaultValue={values.name} />
        </Field>

        <input type="hidden" name="mediaKey" value={values.mediaKey} />
        <input type="hidden" name="mediaMime" value={values.mediaMime} />
        <Field id="mediaFile" label="Gambar kampanye (opsional)" error={fieldError("mediaFile")}>
          <Input id="mediaFile" name="mediaFile" type="file" accept="image/jpeg,image/png,image/webp" />
        </Field>
        <Field id="mediaCaption" label="Caption gambar" error={fieldError("mediaCaption")}>
          <Input id="mediaCaption" name="mediaCaption" maxLength={1024} defaultValue={values.mediaCaption} placeholder="Pesan singkat di bawah gambar" />
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
        <legend className="text-sm font-semibold">Message</legend>

        <Field
          id="messageText"
          label="Message text"
          error={fieldError("messageText")}
        >
          <textarea
            id="messageText"
            name="messageText"
            required
            maxLength={4096}
            rows={5}
            defaultValue={values.messageText}
            className="w-full rounded-lg border border-input bg-background p-3 text-sm"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="ctaLabel" label="CTA label" error={fieldError("ctaLabel")}>
            <Input
              id="ctaLabel"
              name="ctaLabel"
              maxLength={64}
              defaultValue={values.ctaLabel}
            />
          </Field>
          <Field id="ctaUrl" label="CTA URL" error={fieldError("ctaUrl")}>
            <Input
              id="ctaUrl"
              name="ctaUrl"
              type="url"
              maxLength={2048}
              defaultValue={values.ctaUrl}
            />
          </Field>
        </div>
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
        {isEdit ? "Save campaign" : "Create draft"}
      </Button>
    </form>
  );
}
