"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, KeyRound } from "lucide-react";
import { toast } from "sonner";

import { changePasswordAction, type ActionState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ActionState = { status: "idle" };

/**
 * Password change form.
 *
 * A successful change bumps the session epoch server-side, so every existing
 * session is invalidated and the user is sent back to sign in (RULES.md §8).
 */
export function ChangePasswordForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    changePasswordAction,
    initialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      router.replace("/login");
    }
  }, [state, router]);

  const fieldError = (field: string): string | undefined =>
    state.status === "error" ? state.fieldErrors?.[field]?.[0] : undefined;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.status === "error" ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{state.message}</span>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="currentPassword">Current password</Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          disabled={pending}
          aria-invalid={Boolean(fieldError("currentPassword"))}
        />
        {fieldError("currentPassword") ? (
          <p role="alert" className="text-xs text-destructive">
            {fieldError("currentPassword")}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="newPassword">New password</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          required
          autoComplete="new-password"
          disabled={pending}
          aria-invalid={Boolean(fieldError("newPassword"))}
          aria-describedby="newPassword-hint"
        />
        <p id="newPassword-hint" className="text-xs text-muted-foreground">
          At least 10 characters with upper case, lower case and a number.
        </p>
        {fieldError("newPassword") ? (
          <p role="alert" className="text-xs text-destructive">
            {fieldError("newPassword")}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          disabled={pending}
          aria-invalid={Boolean(fieldError("confirmPassword"))}
        />
        {fieldError("confirmPassword") ? (
          <p role="alert" className="text-xs text-destructive">
            {fieldError("confirmPassword")}
          </p>
        ) : null}
      </div>

      <Button type="submit" loading={pending}>
        <KeyRound aria-hidden="true" />
        Update password
      </Button>
    </form>
  );
}
