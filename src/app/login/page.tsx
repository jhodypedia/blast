import type { Metadata } from "next";
import { AlertTriangle, Gauge, ShieldCheck, Smartphone } from "lucide-react";

import { LoginForm } from "@/components/auth/login-form";
import { AuthShell } from "@/components/layout/auth-shell";
import { Notice } from "@/components/ui/page";

export const metadata: Metadata = {
  title: "Sign in",
};

const HIGHLIGHTS = [
  {
    icon: <ShieldCheck className="size-5" />,
    title: "Admin-controlled campaigns",
    description:
      "Message content, targets, payout rate and schedule are set by the platform team.",
  },
  {
    icon: <Smartphone className="size-5" />,
    title: "Your own devices",
    description:
      "Pair up to the configured device limit and run only assigned campaigns.",
  },
  {
    icon: <Gauge className="size-5" />,
    title: "Queue-backed delivery",
    description:
      "Sends run through a worker queue with per-recipient state and confirmed-only earnings.",
  },
];

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
    <AuthShell
      title="Sign in"
      subtitle="Use the email and password for your operator account."
      highlights={HIGHLIGHTS}
    >
      {error === "AccountSuspended" ? (
        <Notice
          tone="warning"
          icon={<AlertTriangle className="size-5" />}
          title="Account suspended"
          className="mb-5"
        >
          This account is suspended. Contact support for assistance.
        </Notice>
      ) : null}
      <LoginForm callbackUrl={callbackUrl} />
    </AuthShell>
  );
}
