"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import {
  campaignTransitionAction,
  type AdminActionState,
} from "@/app/actions/admin-campaigns";
import { Button } from "@/components/ui/button";

const initialState: AdminActionState = { status: "idle" };

/** Transitions offered for each source status. Mirrors the service rules. */
const AVAILABLE: Record<string, Array<{ action: string; label: string }>> = {
  DRAFT: [
    { action: "SCHEDULE", label: "Schedule" },
    { action: "ACTIVATE", label: "Activate" },
    { action: "CANCEL", label: "Cancel" },
  ],
  SCHEDULED: [
    { action: "ACTIVATE", label: "Activate" },
    { action: "CANCEL", label: "Cancel" },
  ],
  ACTIVE: [
    { action: "PAUSE", label: "Pause" },
    { action: "CANCEL", label: "Cancel" },
  ],
  PAUSED: [
    { action: "RESUME", label: "Resume" },
    { action: "CANCEL", label: "Cancel" },
  ],
  COMPLETED: [{ action: "ARCHIVE", label: "Archive" }],
  PARTIAL_FAILED: [{ action: "ARCHIVE", label: "Archive" }],
  CANCELLED: [{ action: "ARCHIVE", label: "Archive" }],
  EXPIRED: [{ action: "ARCHIVE", label: "Archive" }],
};

const DESTRUCTIVE = new Set(["CANCEL"]);

/**
 * Campaign lifecycle buttons.
 *
 * The server re-validates every transition against the current status, so a
 * stale page cannot force an illegal change (RULES.md §6).
 */
export function CampaignTransitionControls({
  campaignId,
  status,
}: {
  campaignId: string;
  status: string;
}) {
  const [state, formAction, pending] = useActionState(
    campaignTransitionAction,
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

  const options = AVAILABLE[status] ?? [];
  if (options.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 border-t-4 border-black pt-3">
      {options.map((option) => (
        <form key={option.action} action={formAction}>
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="action" value={option.action} />
          {DESTRUCTIVE.has(option.action) ? (
            <input
              type="hidden"
              name="reason"
              value="Cancelled by administrator"
            />
          ) : null}
          <Button
            type="submit"
            size="sm"
            variant={
              DESTRUCTIVE.has(option.action)
                ? "destructive"
                : option.action === "ACTIVATE" || option.action === "RESUME"
                  ? "default"
                  : "outline"
            }
            loading={pending}
          >
            {option.label}
          </Button>
        </form>
      ))}
    </div>
  );
}
