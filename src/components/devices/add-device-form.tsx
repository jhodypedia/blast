"use client";

import { useActionState, useEffect } from "react";
import { AlertCircle, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  createDeviceAction,
  type DeviceActionState,
} from "@/app/actions/devices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: DeviceActionState = { status: "idle" };

/**
 * Adds a device slot. The per-user cap is enforced server-side inside a
 * serialisable transaction, so this form never needs to know the limit.
 */
export function AddDeviceForm({ disabled }: { disabled?: boolean }) {
  const [state, formAction, pending] = useActionState(
    createDeviceAction,
    initialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
    }
  }, [state]);

  const fieldError =
    state.status === "error" ? state.fieldErrors?.label?.[0] : undefined;

  return (
    <form action={formAction} className="space-y-3" noValidate>
      {state.status === "error" ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{state.message}</span>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="label">Device name</Label>
        <Input
          id="label"
          name="label"
          required
          maxLength={48}
          placeholder="Sales phone 1"
          disabled={pending || disabled}
          aria-invalid={Boolean(fieldError)}
          aria-describedby={fieldError ? "label-error" : undefined}
        />
        {fieldError ? (
          <p id="label-error" role="alert" className="text-xs text-destructive">
            {fieldError}
          </p>
        ) : null}
      </div>

      <Button type="submit" loading={pending} disabled={disabled}>
        <Plus aria-hidden="true" />
        Add device
      </Button>
    </form>
  );
}
