import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MessageSquareShare } from "lucide-react";

import { RegisterForm } from "@/components/auth/register-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSetting } from "@/lib/settings/service";
import { SETTING_KEYS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Create account",
};

// Registration availability is a live setting, so this page must never be
// prerendered at build time.
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  // Registration can be closed from admin settings; the action re-checks too.
  if (!(await getSetting(SETTING_KEYS.registrationEnabled))) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-background via-background to-accent/30 px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="gradient-primary flex size-12 items-center justify-center rounded-xl text-primary-foreground shadow-sm">
            <MessageSquareShare className="size-6" aria-hidden="true" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">
            Create your operator account
          </h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Get started</CardTitle>
            <CardDescription>
              Operator accounts run campaigns created by the platform team.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RegisterForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
