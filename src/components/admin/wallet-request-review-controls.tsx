"use client";

import { useActionState, useEffect } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

import {
  reviewWalletChangeAction,
  type AdminMoneyActionState,
} from "@/app/actions/admin-money";
import { Button } from "@/components/ui/button";

const initialState: AdminMoneyActionState = { status: "idle" };

/**
 * Approve / reject a wallet change request.
 *
 * Approving copies the encrypted values onto the wallet; rejecting restores the
 * previous wallet to active use. Both paths are audited (RULES.md §15).
 */
export function WalletRequestReviewControls({
  changeRequestId,
}: {
  changeRequestId: string;
}) {
  const [state, formAction, pending] = useActionState(
    reviewWalletChangeAction,
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

  return (
    <div className="flex flex-wrap gap-2">
      <form action={formAction}>
        <input
          type="hidden"
          name="changeRequestId"
          value={changeRequestId}
        />
        <input type="hidden" name="decision" value="APPROVE" />
        <Button type="submit" size="sm" loading={pending}>
          <Check aria-hidden="true" />
          Approve
        </Button>
      </form>

      <form action={formAction}>
        <input
          type="hidden"
          name="changeRequestId"
          value={changeRequestId}
        />
        <input type="hidden" name="decision" value="REJECT" />
        <input
          type="hidden"
          name="note"
          value="Rejected by administrator"
        />
        <Button
          type="submit"
          size="sm"
          variant="destructive"
          loading={pending}
        >
          <X aria-hidden="true" />
          Reject
        </Button>
      </form>
    </div>
  );
}
