"use client";

import { useActionState, useEffect } from "react";
import { AlertCircle, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  uploadTargetListAction,
  type TargetActionState,
} from "@/app/actions/admin-targets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: TargetActionState = { status: "idle" };

/**
 * Target-list upload.
 *
 * The file is streamed to private storage by the server action; nothing is parsed
 * in the browser and no numbers are ever rendered (RULES.md §10).
 */
export function UploadTargetListForm({
  defaultCountryCode,
}: {
  defaultCountryCode: string;
}) {
  const [state, formAction, pending] = useActionState(
    uploadTargetListAction,
    initialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
    }
  }, [state]);

  const fieldError = (field: string): string | undefined =>
    state.status === "error" ? state.fieldErrors?.[field]?.[0] : undefined;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.status === "error" ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{state.message}</span>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="target-name">List name</Label>
          <Input
            id="target-name"
            name="name"
            required
            maxLength={120}
            placeholder="October reminders"
            disabled={pending}
            aria-invalid={Boolean(fieldError("name"))}
          />
          {fieldError("name") ? (
            <p role="alert" className="text-xs text-destructive">
              {fieldError("name")}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="defaultCountryCode">Default country</Label>
          <Input
            id="defaultCountryCode"
            name="defaultCountryCode"
            defaultValue={defaultCountryCode}
            maxLength={2}
            className="uppercase"
            disabled={pending}
            aria-describedby="country-hint"
          />
          <p id="country-hint" className="text-xs text-muted-foreground">
            Applied only to local numbers without a country prefix.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="target-file">File</Label>
        <Input
          id="target-file"
          name="file"
          type="file"
          accept=".txt,.csv"
          required
          disabled={pending}
          aria-invalid={Boolean(fieldError("file"))}
        />
        {fieldError("file") ? (
          <p role="alert" className="text-xs text-destructive">
            {fieldError("file")}
          </p>
        ) : null}
      </div>

      <Button type="submit" loading={pending}>
        <Upload aria-hidden="true" />
        Upload and import
      </Button>
    </form>
  );
}
