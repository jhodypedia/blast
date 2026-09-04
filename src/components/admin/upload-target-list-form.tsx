"use client";

import { useActionState, useEffect } from "react";
import { AlertCircle, FileText, Upload } from "lucide-react";
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
          className="flex items-start gap-2 border-4 border-black bg-destructive p-3 text-sm font-bold text-destructive-foreground"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{state.message}</span>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="target-name">Nama daftar</Label>
          <Input
            id="target-name"
            name="name"
            required
            maxLength={120}
            placeholder="Kontak pelanggan Oktober"
            disabled={pending}
            aria-invalid={Boolean(fieldError("name"))}
          />
          {fieldError("name") ? (
            <p
              role="alert"
              className="border-2 border-black bg-destructive px-2 py-1 text-xs font-black uppercase text-destructive-foreground"
            >
              {fieldError("name")}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="defaultCountryCode">Negara default</Label>
          <Input
            id="defaultCountryCode"
            name="defaultCountryCode"
            defaultValue={defaultCountryCode}
            maxLength={2}
            className="uppercase"
            disabled={pending}
            aria-describedby="country-hint"
          />
          <p id="country-hint" className="text-xs font-bold text-foreground">
            Hanya dipakai untuk nomor lokal tanpa awalan negara.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="target-file">File nomor</Label>
        <label
          htmlFor="target-file"
          className="flex cursor-pointer flex-col items-center justify-center gap-2 border-4 border-dashed border-black bg-surface px-5 py-7 text-center transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-accent"
        >
          <FileText className="size-7 text-primary" aria-hidden="true" />
          <span className="text-sm font-black uppercase tracking-wide">
            Pilih file .TXT atau .CSV
          </span>
          <span className="text-xs font-bold text-foreground">
            Satu nomor per baris, tanpa nama atau kolom tambahan
          </span>
          <Input
            id="target-file"
            name="file"
            type="file"
            accept=".txt,.csv"
            required
            disabled={pending}
            aria-invalid={Boolean(fieldError("file"))}
            className="sr-only"
          />
        </label>
        {fieldError("file") ? (
          <p
            role="alert"
            className="border-2 border-black bg-destructive px-2 py-1 text-xs font-black uppercase text-destructive-foreground"
          >
            {fieldError("file")}
          </p>
        ) : null}
      </div>

      <Button type="submit" loading={pending}>
        <Upload aria-hidden="true" />
        Upload dan proses nomor
      </Button>
    </form>
  );
}
