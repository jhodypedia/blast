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
      <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning-foreground">
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
          className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{state.message}</span>
        </div>
      ) : null}

      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Available</dt>
          <dd className="font-semibold text-success">{availableLabel}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Minimum</dt>
          <dd className="font-medium">{minAmountLabel}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Fee</dt>
          <dd className="font-medium">{feeLabel}</dd>
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
          <p role="alert" className="text-xs text-destructive">
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
          <p role="alert" className="text-xs text-destructive">
            {fieldError("password")}
          </p>
        ) : null}
      </div>

      <TurnstileWidget action="withdrawal" />

      <label className="flex min-h-11 items-start gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          name="confirm"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-0.5 size-4"
          disabled={pending}
        />
        <span>
          I confirm the payout details are correct and this request is final until
          reviewed.
        </span>
      </label>
      {fieldError("confirm") ? (
        <p role="alert" className="text-xs text-destructive">
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
