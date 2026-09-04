"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AlertCircle, LogIn, Mail, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

import { loginAction, type ActionState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TurnstileWidget } from "@/components/security/turnstile-widget";

const initialState: ActionState = { status: "idle" };

/**
 * Login form.
 *
 * Client-side validation is intentionally light: the server action is the
 * authority and returns field errors for display (RULES.md §7).
 */
export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  useEffect(() => {
    if (state.status === "success") {
      toast.success("Signed in");
      // The proxy redirects to the correct root for the account's role.
      router.replace(callbackUrl ?? "/dashboard");
      router.refresh();
    }
  }, [state, router, callbackUrl]);

  const fieldError = (field: string): string | undefined =>
    state.status === "error" ? state.fieldErrors?.[field]?.[0] : undefined;

  return (
    <motion.form
      action={formAction}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "linear" }}
      className="space-y-5"
      noValidate
    >
      {state.status === "error" ? (
        <div
          role="alert"
          className="flex items-start gap-2 border-4 border-black bg-destructive p-3 text-sm font-bold text-destructive-foreground"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{state.message}</span>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <div className="relative">
          <Mail
            className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-foreground"
            aria-hidden="true"
          />
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="pl-9"
            aria-invalid={Boolean(fieldError("email"))}
            aria-describedby={fieldError("email") ? "email-error" : undefined}
            disabled={pending}
          />
        </div>
        {fieldError("email") ? (
          <p
            id="email-error"
            role="alert"
            className="border-2 border-black bg-destructive px-2 py-1 text-xs font-black uppercase text-destructive-foreground"
          >
            {fieldError("email")}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Lock
            className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-foreground"
            aria-hidden="true"
          />
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="pl-9"
            aria-invalid={Boolean(fieldError("password"))}
            aria-describedby={
              fieldError("password") ? "password-error" : undefined
            }
            disabled={pending}
          />
        </div>
        {fieldError("password") ? (
          <p
            id="password-error"
            role="alert"
            className="border-2 border-black bg-destructive px-2 py-1 text-xs font-black uppercase text-destructive-foreground"
          >
            {fieldError("password")}
          </p>
        ) : null}
      </div>

      <TurnstileWidget action="login" />

      <Button type="submit" className="w-full" loading={pending}>
        {pending ? null : <LogIn aria-hidden="true" />}
        Sign in
      </Button>

      <p className="text-center text-sm font-bold uppercase text-foreground">
        No account yet?{" "}
        <Link href="/register" className="font-black uppercase">
          Create one
        </Link>
      </p>
    </motion.form>
  );
}
