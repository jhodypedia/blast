"use client";

import { useActionState, useEffect } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";

import {
  updateSettingAction,
  type AdminActionState,
} from "@/app/actions/admin-users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AdminActionState = { status: "idle" };

/**
 * One editable setting.
 *
 * The value is submitted verbatim as JSON; the server parses and validates it
 * against the registry schema before writing (RULES.md §17).
 */
export function SettingRow({
  settingKey,
  label,
  help,
  value,
}: {
  settingKey: string;
  label: string;
  help: string;
  value: string;
}) {
  const [state, formAction, pending] = useActionState(
    updateSettingAction,
    initialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
    }
    if (state.status === "error") {
      toast.error(state.message);
    }
  }, [state]);

  const inputId = `setting-${settingKey}`;
  const fieldError =
    state.status === "error" ? state.fieldErrors?.value?.[0] : undefined;

  return (
    <form
      action={formAction}
      className="space-y-2 border-4 border-black bg-card p-4 shadow-panel"
      noValidate
    >
      <input type="hidden" name="key" value={settingKey} />
      <Label htmlFor={inputId}>{label}</Label>
      <p className="text-xs font-bold text-foreground">{help}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={inputId}
          name="value"
          defaultValue={value}
          required
          maxLength={4096}
          className="font-mono text-xs"
          disabled={pending}
          aria-invalid={Boolean(fieldError)}
          aria-describedby={fieldError ? `${inputId}-error` : undefined}
        />
        <Button type="submit" size="sm" loading={pending} className="sm:w-auto">
          <Save aria-hidden="true" />
          Save
        </Button>
      </div>
      <p className="text-xs font-bold uppercase text-foreground">
        Key: <span className="font-mono">{settingKey}</span>
      </p>
      {fieldError ? (
        <p
          id={`${inputId}-error`}
          role="alert"
          className="border-2 border-black bg-destructive px-2 py-1 text-xs font-black uppercase text-destructive-foreground"
        >
          {fieldError}
        </p>
      ) : null}
    </form>
  );
}
