"use client";

import { useActionState, useEffect } from "react";
import { AlertCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { setWalletAction, type WalletActionState } from "@/app/actions/wallet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TurnstileWidget } from "@/components/security/turnstile-widget";

const initialState: WalletActionState = { status: "idle" };

export type WalletProviderOption = { code: string; name: string };

/**
 * Wallet setup / change-request form.
 *
 * The wallet may be set once; the same action routes a later submission into a
 * review request, so this form never decides which path is taken (RULES.md §15).
 */
export function WalletForm({
  providers,
  isChange,
  disabled,
  disabledReason,
}: {
  providers: WalletProviderOption[];
  isChange: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [state, formAction, pending] = useActionState(
    setWalletAction,
    initialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
    }
  }, [state]);

  const fieldError = (field: string): string | undefined =>
    state.status === "error" ? state.fieldErrors?.[field]?.[0] : undefined;

  if (disabled) {
    return (
      <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning-foreground">
        {disabledReason ?? "Wallet changes are not available right now."}
      </p>
    );
  }

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

      <div className="space-y-2">
        <Label htmlFor="fullName">Full name on the account</Label>
        <Input
          id="fullName"
          name="fullName"
          required
          maxLength={80}
          autoComplete="name"
          disabled={pending}
          aria-invalid={Boolean(fieldError("fullName"))}
        />
        {fieldError("fullName") ? (
          <p role="alert" className="text-xs text-destructive">
            {fieldError("fullName")}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="providerCode">Bank or e-wallet</Label>
        <select
          id="providerCode"
          name="providerCode"
          required
          disabled={pending}
          className="flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
        >
          {providers.map((provider) => (
            <option key={provider.code} value={provider.code}>
              {provider.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="accountNumber">Account number</Label>
          <Input
            id="accountNumber"
            name="accountNumber"
            required
            inputMode="numeric"
            maxLength={24}
            autoComplete="off"
            disabled={pending}
            aria-invalid={Boolean(fieldError("accountNumber"))}
          />
          {fieldError("accountNumber") ? (
            <p role="alert" className="text-xs text-destructive">
              {fieldError("accountNumber")}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmAccountNumber">Confirm account number</Label>
          <Input
            id="confirmAccountNumber"
            name="confirmAccountNumber"
            required
            inputMode="numeric"
            maxLength={24}
            autoComplete="off"
            disabled={pending}
            aria-invalid={Boolean(fieldError("confirmAccountNumber"))}
          />
          {fieldError("confirmAccountNumber") ? (
            <p role="alert" className="text-xs text-destructive">
              {fieldError("confirmAccountNumber")}
            </p>
          ) : null}
        </div>
      </div>

      <TurnstileWidget action="wallet" />

      <div className="flex items-start gap-2 rounded-lg border border-info/25 bg-info/10 p-3 text-xs text-info">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          {isChange
            ? "Changing your wallet requires admin review. Withdrawals pause until it is approved."
            : "You can set your wallet once. Later changes require admin review."}
        </span>
      </div>

      <Button type="submit" loading={pending}>
        {isChange ? "Submit change request" : "Save wallet"}
      </Button>
    </form>
  );
}
