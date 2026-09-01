"use client";

import { useActionState, useEffect, useState } from "react";
import { Archive } from "lucide-react";
import { toast } from "sonner";

import {
  archiveTargetListAction,
  type TargetActionState,
} from "@/app/actions/admin-targets";
import { Button } from "@/components/ui/button";

const initialState: TargetActionState = { status: "idle" };

/**
 * Archives a target list after an explicit confirmation.
 *
 * Archiving is a soft delete: numbers and delivery history are retained so past
 * campaigns stay reconstructable (RULES.md §20).
 */
export function ArchiveTargetListButton({
  targetListId,
}: {
  targetListId: string;
}) {
  const [state, formAction, pending] = useActionState(
    archiveTargetListAction,
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
        <Archive aria-hidden="true" />
        Archive
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={() => setConfirming(false)}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="targetListId" value={targetListId} />
      <input
        type="hidden"
        name="reason"
        value="Archived by administrator"
      />
      <span className="text-xs text-muted-foreground">
        Archive this list? Numbers and history are kept.
      </span>
      <Button type="submit" variant="destructive" size="sm" loading={pending}>
        Confirm
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setConfirming(false)}
      >
        Cancel
      </Button>
    </form>
  );
}
