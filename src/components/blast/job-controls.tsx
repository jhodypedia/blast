"use client";

import { useActionState, useEffect } from "react";
import { Pause, Play, Square } from "lucide-react";
import { toast } from "sonner";

import {
  blastJobControlAction,
  type BlastActionState,
} from "@/app/actions/blast";
import { Button } from "@/components/ui/button";

const initialState: BlastActionState = { status: "idle" };

/**
 * Pause / resume / stop controls for the operator's own job.
 *
 * Availability is decided by the campaign policy snapshotted on the job and is
 * re-checked server-side before any transition (RULES.md §11).
 */
export function JobControls({
  blastJobId,
  status,
  allowUserPause,
}: {
  blastJobId: string;
  status:
    | "PENDING"
    | "QUEUED"
    | "RUNNING"
    | "PAUSED"
    | "COMPLETED"
    | "PARTIAL_FAILED"
    | "CANCELLED"
    | "FAILED";
  allowUserPause: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    blastJobControlAction,
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

  const live = ["PENDING", "QUEUED", "RUNNING", "PAUSED"].includes(status);
  if (!live) {
    return null;
  }

  const canPause = allowUserPause && ["QUEUED", "RUNNING"].includes(status);
  const canResume = status === "PAUSED";

  return (
    <div className="flex flex-wrap gap-2">
      {canPause ? (
        <form action={formAction}>
          <input type="hidden" name="blastJobId" value={blastJobId} />
          <input type="hidden" name="action" value="PAUSE" />
          <Button type="submit" variant="outline" size="sm" loading={pending}>
            <Pause aria-hidden="true" />
            Pause
          </Button>
        </form>
      ) : null}

      {canResume ? (
        <form action={formAction}>
          <input type="hidden" name="blastJobId" value={blastJobId} />
          <input type="hidden" name="action" value="RESUME" />
          <Button type="submit" size="sm" loading={pending}>
            <Play aria-hidden="true" />
            Resume
          </Button>
        </form>
      ) : null}

      <form action={formAction}>
        <input type="hidden" name="blastJobId" value={blastJobId} />
        <input type="hidden" name="action" value="STOP" />
        <input type="hidden" name="reason" value="Stopped by operator" />
        <Button
          type="submit"
          variant="destructive"
          size="sm"
          loading={pending}
        >
          <Square aria-hidden="true" />
          Stop
        </Button>
      </form>
    </div>
  );
}
