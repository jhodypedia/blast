import type { Metadata } from "next";
import { MessageSquareShare } from "lucide-react";

import { LoginForm } from "@/components/auth/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const callbackUrl =
    typeof params.callbackUrl === "string" ? params.callbackUrl : undefined;
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-background via-background to-accent/30 px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="gradient-primary flex size-12 items-center justify-center rounded-xl text-primary-foreground shadow-sm">
            <MessageSquareShare className="size-6" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              WhatsApp Blast Platform
            </h1>
            <p className="text-sm text-muted-foreground">
              Consent-based campaign delivery for verified operators.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Use the email and password for your operator account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error === "AccountSuspended" ? (
              <div
                role="alert"
                className="mb-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning-foreground"
              >
                This account is suspended. Contact support for assistance.
              </div>
            ) : null}
            <LoginForm callbackUrl={callbackUrl} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
