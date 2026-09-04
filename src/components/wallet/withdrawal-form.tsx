"use client";

import { useActionState, useEffect, useState } from "react";
import { AlertCircle, Banknote } from "lucide-react";
import { toast } from "sonner";

import {
  requestWithdrawalAction,
  type WalletActionState,
} from "@/app/actions/wallet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TurnstileWidget } from "@/components/security/turnstile-widget";

const initialState: WalletActionState = { status: "idle" };

/**
 * Withdrawal request form.
 *
 * Requires an explicit confirmation, the account password and a Turnstile token.
 * The available balance and fee are recomputed server-side (RULES.md §15).
 */
export function WithdrawalForm({
  availableLabel,
  minAmountLabel,
  feeLabel,
  disabled,
  disabledReason,
}: {
  availableLabel: string;
  minAmountLabel: string;
  feeLabel: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [state, formAction, pending] = useActionState(
    requestWithdrawalAction,
    initialState,
  );
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
    }
  }, [state]);

  const fieldError = (field: string): string | undefined =>
    state.status === "error" ? state.fieldErrors?.[field]?.[0] : undefined;

  if (disabled) {
    return (
      <p className="border-4 border-black bg-warning p-3 text-xs font-bold text-warning-foreground">
        {disabledReason ?? "Withdrawals are unavailable right now."}
      </p>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={() => setConfirmed(false)}
      className="space-y-4"
      noValidate
    >
      {state.status === "error" ? (
        <div
          role="alert"
          className="flex items-start gap-2 border-4 border-black bg-destructive p-3 text-sm font-bold text-destructive-foreground"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{state.message}</span>
        </div>
      ) : null}

      <dl className="grid grid-cols-3 border-4 border-black bg-surface text-xs">
        <div className="border-r-2 border-black p-2">
          <dt className="font-black uppercase tracking-widest text-foreground">Available</dt>
          <dd className="mt-1 font-black text-success">{availableLabel}</dd>
        </div>
        <div className="border-r-2 border-black p-2">
          <dt className="font-black uppercase tracking-widest text-foreground">Minimum</dt>
          <dd className="mt-1 font-black">{minAmountLabel}</dd>
        </div>
        <div className="p-2">
          <dt className="font-black uppercase tracking-widest text-foreground">Fee</dt>
          <dd className="mt-1 font-black">{feeLabel}</dd>
        </div>
      </dl>

      <div className="space-y-2">
        <Label htmlFor="amount">Amount to withdraw</Label>
        <Input
          id="amount"
          name="amount"
          required
          inputMode="decimal"
          placeholder="50000"
          disabled={pending}
          aria-invalid={Boolean(fieldError("amount"))}
        />
        {fieldError("amount") ? (
          <p
            role="alert"
            className="border-2 border-black bg-destructive px-2 py-1 text-xs font-black uppercase text-destructive-foreground"
          >
            {fieldError("amount")}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="withdrawal-password">Confirm your password</Label>
        <Input
          id="withdrawal-password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          disabled={pending}
          aria-invalid={Boolean(fieldError("password"))}
        />
        {fieldError("password") ? (
          <p
            role="alert"
            className="border-2 border-black bg-destructive px-2 py-1 text-xs font-black uppercase text-destructive-foreground"
          >
            {fieldError("password")}
          </p>
        ) : null}
      </div>

      <TurnstileWidget action="withdrawal" />

      <label className="flex min-h-11 items-start gap-2 border-2 border-black bg-surface p-2 text-xs font-bold text-foreground">
        <input
          type="checkbox"
          name="confirm"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-0.5 size-4 border-2 border-black accent-primary"
          disabled={pending}
        />
        <span>
          I confirm the payout details are correct and this request is final until
          reviewed.
        </span>
      </label>
      {fieldError("confirm") ? (
        <p
          role="alert"
          className="border-2 border-black bg-destructive px-2 py-1 text-xs font-black uppercase text-destructive-foreground"
        >
          {fieldError("confirm")}
        </p>
      ) : null}

      <Button type="submit" loading={pending} disabled={!confirmed}>
        <Banknote aria-hidden="true" />
        Request withdrawal
      </Button>
    </form>
  );
}
