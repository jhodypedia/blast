"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, UserPlus } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

import { registerAction, type ActionState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TurnstileWidget } from "@/components/security/turnstile-widget";

const initialState: ActionState = { status: "idle" };

/** Registration form. Role is never submitted; the server always assigns USER. */
export function RegisterForm() {
  const [state, formAction, pending] = useActionState(
    registerAction,
    initialState,
  );

  useEffect(() => {
    if (state.status === "success" && state.message) {
      toast.success(state.message);
    }
  }, [state]);

  const fieldError = (field: string): string | undefined =>
    state.status === "error" ? state.fieldErrors?.[field]?.[0] : undefined;

  if (state.status === "success") {
    return (
      <div className="space-y-4 text-center">
        <span className="mx-auto flex size-12 items-center justify-center border-4 border-black bg-success text-success-foreground">
          <CheckCircle2 className="size-6" aria-hidden="true" />
        </span>
        <p className="text-sm font-bold text-foreground">{state.message}</p>
        <Button asChild className="w-full">
          <Link href="/login">Go to sign in</Link>
        </Button>
      </div>
    );
  }

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
        <Label htmlFor="name">Full name</Label>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          required
          disabled={pending}
          aria-invalid={Boolean(fieldError("name"))}
        />
        {fieldError("name") ? (
          <p
            role="alert"
            className="border-2 border-black bg-destructive px-2 py-1 text-xs font-black uppercase text-destructive-foreground"
          >
            {fieldError("name")}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={pending}
          aria-invalid={Boolean(fieldError("email"))}
        />
        {fieldError("email") ? (
          <p
            role="alert"
            className="border-2 border-black bg-destructive px-2 py-1 text-xs font-black uppercase text-destructive-foreground"
          >
            {fieldError("email")}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          disabled={pending}
          aria-invalid={Boolean(fieldError("password"))}
          aria-describedby="password-hint"
        />
        <p id="password-hint" className="text-xs font-bold text-foreground">
          At least 10 characters with upper case, lower case and a number.
        </p>
        {fieldError("password") ? (
          <p
            role="alert"
            className="border-2 border-black bg-destructive px-2 py-1 text-xs font-black uppercase text-destructive-foreground"
          >
            {fieldError("password")}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          disabled={pending}
          aria-invalid={Boolean(fieldError("confirmPassword"))}
        />
        {fieldError("confirmPassword") ? (
          <p
            role="alert"
            className="border-2 border-black bg-destructive px-2 py-1 text-xs font-black uppercase text-destructive-foreground"
          >
            {fieldError("confirmPassword")}
          </p>
        ) : null}
      </div>

      <div className="flex items-start gap-3 border-4 border-black bg-surface p-3">
        <input
          id="acceptTerms"
          name="acceptTerms"
          type="checkbox"
          required
          disabled={pending}
          className="mt-0.5 size-4 border-2 border-black accent-primary"
        />
        <Label
          htmlFor="acceptTerms"
          className="text-xs font-bold normal-case leading-snug tracking-normal text-foreground"
        >
          I confirm that I will only send messages to recipients who have given
          valid consent or have an existing service relationship, and that I will
          comply with WhatsApp&apos;s policies.
        </Label>
      </div>
      {fieldError("acceptTerms") ? (
        <p
          role="alert"
          className="border-2 border-black bg-destructive px-2 py-1 text-xs font-black uppercase text-destructive-foreground"
        >
          {fieldError("acceptTerms")}
        </p>
      ) : null}

      <TurnstileWidget action="register" />

      <Button type="submit" className="w-full" loading={pending}>
        {pending ? null : <UserPlus aria-hidden="true" />}
        Create account
      </Button>

      <p className="text-center text-sm font-bold uppercase text-foreground">
        Already registered?{" "}
        <Link href="/login" className="font-black uppercase">
          Sign in
        </Link>
      </p>
    </motion.form>
  );
}
