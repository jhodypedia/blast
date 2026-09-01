"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  cancelWithdrawalAction,
  type WalletActionState,
} from "@/app/actions/wallet";
import { Button } from "@/components/ui/button";

const initialState: WalletActionState = { status: "idle" };

/**
 * Cancels the caller's own pending withdrawal.
 *
 * Ownership is enforced in the service; this button only asks for an explicit
 * confirmation before the money-moving reversal is created.
 */
export function CancelWithdrawalButton({
  withdrawalId,
}: {
  withdrawalId: string;
}) {
  const [state, formAction, pending] = useActionState(
    cancelWithdrawalAction,
    initialState,
  );
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
    }
    if (state.status === "error") {
      toast.error(state.message);
    }
  }, [state]);

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setConfirming(true)}
      >
        Cancel
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={() => setConfirming(false)}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="withdrawalId" value={withdrawalId} />
      <Button type="submit" variant="destructive" size="sm" loading={pending}>
        Confirm
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setConfirming(false)}
      >
        Keep
      </Button>
    </form>
  );
}
