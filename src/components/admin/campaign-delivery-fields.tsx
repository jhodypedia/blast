"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Field,
  SPEED_OPTIONS,
  type CampaignFormOption,
  type CampaignFormValues,
} from "@/components/admin/campaign-form-shared";

/**
 * Delivery, payout, assignment and schedule fields.
 *
 * Split out of `CampaignForm` purely for file size; it shares the same submitted
 * `FormData` and the same server-side schema.
 */
export function CampaignDeliveryFields({
  values,
  targetLists,
  operators,
  policy,
  setPolicy,
  lockEconomics,
  pending,
  fieldError,
}: {
  values: CampaignFormValues;
  targetLists: CampaignFormOption[];
  operators: CampaignFormOption[];
  policy: "ALL_ELIGIBLE" | "SELECTED_USERS";
  setPolicy: (value: "ALL_ELIGIBLE" | "SELECTED_USERS") => void;
  lockEconomics?: boolean;
  pending: boolean;
  fieldError: (field: string) => string | undefined;
}) {
  return (
    <>
      <fieldset className="space-y-4" disabled={pending}>
        <legend className="text-sm font-semibold">Targeting and payout</legend>

        {lockEconomics ? (
          <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning-foreground">
            Recipients already exist for this campaign, so the target list, payout
            and currency can no longer change.
          </p>
        ) : null}

        <Field
          id="targetListId"
          label="Target list"
          error={fieldError("targetListId")}
        >
          <select
            id="targetListId"
            name="targetListId"
            required
            defaultValue={values.targetListId}
            disabled={pending || lockEconomics}
            className="flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="">Select a list</option>
            {targetLists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="payoutPerSend"
            label="Payout per confirmed send"
            error={fieldError("payoutPerSend")}
          >
            <Input
              id="payoutPerSend"
              name="payoutPerSend"
              required
              inputMode="decimal"
              defaultValue={values.payoutPerSend}
              disabled={pending || lockEconomics}
            />
          </Field>
          <Field id="currency" label="Currency" error={fieldError("currency")}>
            <Input
              id="currency"
              name="currency"
              required
              maxLength={3}
              className="uppercase"
              defaultValue={values.currency}
              disabled={pending || lockEconomics}
            />
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Allowed speeds</legend>
          <div className="flex flex-wrap gap-4">
            {SPEED_OPTIONS.map((speed) => (
              <label
                key={speed}
                className="flex min-h-11 items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  name="allowedSpeeds"
                  value={speed}
                  defaultChecked={values.allowedSpeeds.includes(speed)}
                  className="size-4"
                />
                {speed}s
              </label>
            ))}
          </div>
          {fieldError("allowedSpeeds") ? (
            <p role="alert" className="text-xs text-destructive">
              {fieldError("allowedSpeeds")}
            </p>
          ) : null}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            id="quotaPerUser"
            label="Quota per operator"
            error={fieldError("quotaPerUser")}
          >
            <Input
              id="quotaPerUser"
              name="quotaPerUser"
              required
              type="number"
              min={1}
              defaultValue={values.quotaPerUser}
            />
          </Field>
          <Field
            id="maxConcurrentJobs"
            label="Max concurrent jobs"
            error={fieldError("maxConcurrentJobs")}
          >
            <Input
              id="maxConcurrentJobs"
              name="maxConcurrentJobs"
              type="number"
              min={1}
              defaultValue={values.maxConcurrentJobs}
            />
          </Field>
          <Field
            id="retryLimit"
            label="Retry limit"
            error={fieldError("retryLimit")}
          >
            <Input
              id="retryLimit"
              name="retryLimit"
              type="number"
              min={0}
              max={5}
              defaultValue={values.retryLimit}
            />
          </Field>
        </div>

        <Field
          id="deviceModePolicy"
          label="Device policy"
          error={fieldError("deviceModePolicy")}
        >
          <select
            id="deviceModePolicy"
            name="deviceModePolicy"
            defaultValue={values.deviceModePolicy}
            className="flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="SINGLE_DEVICE">One device per job</option>
            <option value="ALL_DEVICES">Any connected device</option>
          </select>
        </Field>
      </fieldset>

      <fieldset className="space-y-4" disabled={pending}>
        <legend className="text-sm font-semibold">
          Assignment and schedule
        </legend>

        <Field
          id="assignmentPolicy"
          label="Who can run this campaign"
          error={fieldError("assignmentPolicy")}
        >
          <select
            id="assignmentPolicy"
            name="assignmentPolicy"
            value={policy}
            onChange={(event) =>
              setPolicy(event.target.value as typeof policy)
            }
            className="flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="ALL_ELIGIBLE">All active operators</option>
            <option value="SELECTED_USERS">Selected operators only</option>
          </select>
        </Field>

        {policy === "SELECTED_USERS" ? (
          <div className="space-y-2">
            <Label htmlFor="assignedUserIds">Assigned operators</Label>
            <select
              id="assignedUserIds"
              name="assignedUserIds"
              multiple
              defaultValue={values.assignedUserIds}
              size={Math.min(Math.max(operators.length, 3), 8)}
              className="w-full rounded-lg border border-input bg-background p-2 text-sm"
            >
              {operators.map((operator) => (
                <option key={operator.id} value={operator.id}>
                  {operator.label}
                </option>
              ))}
            </select>
            {fieldError("assignedUserIds") ? (
              <p role="alert" className="text-xs text-destructive">
                {fieldError("assignedUserIds")}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="scheduledStartAt"
            label="Start (UTC)"
            error={fieldError("scheduledStartAt")}
          >
            <Input
              id="scheduledStartAt"
              name="scheduledStartAt"
              type="datetime-local"
              required
              defaultValue={values.scheduledStartAt}
            />
          </Field>
          <Field
            id="scheduledEndAt"
            label="End (UTC)"
            error={fieldError("scheduledEndAt")}
          >
            <Input
              id="scheduledEndAt"
              name="scheduledEndAt"
              type="datetime-local"
              required
              defaultValue={values.scheduledEndAt}
            />
          </Field>
        </div>

        <div className="space-y-2">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="allowUserPause"
              defaultChecked={values.allowUserPause}
              className="size-4"
            />
            Operators may pause their own job
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="requireTermsAccept"
              defaultChecked={values.requireTermsAccept}
              className="size-4"
            />
            Require a consent confirmation before starting
          </label>
        </div>
      </fieldset>
    </>
  );
}
