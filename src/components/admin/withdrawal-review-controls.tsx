"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  reviewWithdrawalAction,
  type AdminMoneyActionState,
} from "@/app/actions/admin-money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AdminMoneyActionState = { status: "idle" };

/** Actions offered per current status. The service re-validates each one. */
const AVAILABLE: Record<string, Array<{ action: string; label: string }>> = {
  PENDING: [
    { action: "APPROVE", label: "Approve" },
    { action: "PROCESS", label: "Mark processing" },
    { action: "REJECT", label: "Reject" },
  ],
  PROCESSING: [
    { action: "MARK_PAID", label: "Mark paid" },
    { action: "REJECT", label: "Reject" },
  ],
  APPROVED: [
    { action: "PROCESS", label: "Mark processing" },
    { action: "MARK_PAID", label: "Mark paid" },
    { action: "REJECT", label: "Reject" },
  ],
};

/**
 * Withdrawal decision controls.
 *
 * Rejection requires a reason and marking as paid requires a payout reference,
 * both enforced by the Zod schema on the server (RULES.md §15).
 */
export function WithdrawalReviewControls({
  withdrawalId,
  status,
}: {
  withdrawalId: string;
  status: string;
}) {
  const [state, formAction, pending] = useActionState(
    reviewWithdrawalAction,
    initialState,
  );
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
    }
    if (state.status === "error") {
      toast.error(state.message);
    }
  }, [state]);

  const options = AVAILABLE[status] ?? [];
  if (options.length === 0) {
    return null;
  }

  if (!selected) {
    return (
      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        {options.map((option) => (
          <Button
            key={option.action}
            type="button"
            size="sm"
            variant={option.action === "REJECT" ? "destructive" : "outline"}
            onClick={() => setSelected(option.action)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    );
  }

  const needsReason = selected === "REJECT";
  const needsReference = selected === "MARK_PAID";

  return (
    <form
      action={formAction}
      onSubmit={() => setSelected(null)}
      className="space-y-3 border-t border-border pt-3"
      noValidate
    >
      <input type="hidden" name="withdrawalId" value={withdrawalId} />
      <input type="hidden" name="action" value={selected} />

      {needsReason ? (
        <div className="space-y-2">
          <Label htmlFor={`reason-${withdrawalId}`}>Rejection reason</Label>
          <Input
            id={`reason-${withdrawalId}`}
            name="rejectionReason"
            required
            maxLength={255}
            placeholder="Shown to the operator"
            disabled={pending}
          />
        </div>
      ) : null}

      {needsReference ? (
        <div className="space-y-2">
          <Label htmlFor={`reference-${withdrawalId}`}>Payout reference</Label>
          <Input
            id={`reference-${withdrawalId}`}
            name="payoutReference"
            required
            maxLength={191}
            placeholder="Bank transfer reference"
            disabled={pending}
          />
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor={`note-${withdrawalId}`}>Internal note</Label>
        <Input
          id={`note-${withdrawalId}`}
          name="note"
          maxLength={255}
          disabled={pending}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          size="sm"
          variant={needsReason ? "destructive" : "default"}
          loading={pending}
        >
          Confirm {selected.replace("_", " ").toLowerCase()}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setSelected(null)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
