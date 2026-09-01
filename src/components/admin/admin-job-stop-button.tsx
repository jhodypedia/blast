"use client";

import { useActionState, useEffect, useState } from "react";
import { Square } from "lucide-react";
import { toast } from "sonner";

import {
  adminStopJobAction,
  type AdminJobActionState,
} from "@/app/actions/admin-jobs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AdminJobActionState = { status: "idle" };

/**
 * Force-stops an operator's job.
 *
 * Requires a reason, which is written to the audit log. Recipients already in
 * `SENDING` are left for reconciliation rather than cancelled.
 */
export function AdminJobStopButton({ blastJobId }: { blastJobId: string }) {
  const [state, formAction, pending] = useActionState(
    adminStopJobAction,
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
        variant="destructive"
        size="sm"
        onClick={() => setConfirming(true)}
      >
        <Square aria-hidden="true" />
        Force stop
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={() => setConfirming(false)}
      className="space-y-3"
      noValidate
    >
      <input type="hidden" name="blastJobId" value={blastJobId} />
      <div className="space-y-2">
        <Label htmlFor={`stop-reason-${blastJobId}`}>Reason</Label>
        <Input
          id={`stop-reason-${blastJobId}`}
          name="reason"
          required
          minLength={5}
          maxLength={255}
          placeholder="Recorded in the audit log"
          disabled={pending}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          variant="destructive"
          size="sm"
          loading={pending}
        >
          Confirm stop
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setConfirming(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
