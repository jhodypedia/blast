"use client";

import { useActionState, useEffect, useState } from "react";
import { LogOut, ShieldBan, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { userAction, type AdminActionState } from "@/app/actions/admin-users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AdminActionState = { status: "idle" };

/**
 * User management controls.
 *
 * Suspension requires a reason, which is stored on the audit entry. Force-logout
 * only bumps the session epoch and needs no reason.
 */
export function UserActionControls({
  userId,
  status,
}: {
  userId: string;
  status: "ACTIVE" | "SUSPENDED";
}) {
  const [state, formAction, pending] = useActionState(userAction, initialState);
  const [suspending, setSuspending] = useState(false);

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
    }
    if (state.status === "error") {
      toast.error(state.message);
    }
  }, [state]);

  if (suspending) {
    return (
      <form
        action={formAction}
        onSubmit={() => setSuspending(false)}
        className="space-y-3 border-t-4 border-black pt-3"
        noValidate
      >
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="action" value="SUSPEND" />
        <div className="space-y-2">
          <Label htmlFor={`suspend-reason-${userId}`}>
            Reason for suspension
          </Label>
          <Input
            id={`suspend-reason-${userId}`}
            name="reason"
            required
            maxLength={255}
            placeholder="Recorded in the audit log"
            disabled={pending}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            size="sm"
            variant="destructive"
            loading={pending}
          >
            Confirm suspension
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setSuspending(false)}
          >
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 border-t-4 border-black pt-3">
      {status === "ACTIVE" ? (
        <Button
          type="button"
          size="sm"
          variant="destructive"
          onClick={() => setSuspending(true)}
        >
          <ShieldBan aria-hidden="true" />
          Suspend
        </Button>
      ) : (
        <form action={formAction}>
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="action" value="REACTIVATE" />
          <Button type="submit" size="sm" loading={pending}>
            <ShieldCheck aria-hidden="true" />
            Reactivate
          </Button>
        </form>
      )}

      <form action={formAction}>
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="action" value="FORCE_LOGOUT" />
        <Button type="submit" size="sm" variant="outline" loading={pending}>
          <LogOut aria-hidden="true" />
          Force logout
        </Button>
      </form>
    </div>
  );
}
