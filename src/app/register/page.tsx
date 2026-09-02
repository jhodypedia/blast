import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Gauge, ShieldCheck, Smartphone } from "lucide-react";

import { RegisterForm } from "@/components/auth/register-form";
import { AuthShell } from "@/components/layout/auth-shell";
import { getSetting } from "@/lib/settings/service";
import { SETTING_KEYS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Create account",
};

// Registration availability is a live setting, so this page must never be
// prerendered at build time.
export const dynamic = "force-dynamic";

const HIGHLIGHTS = [
  {
    icon: <ShieldCheck className="size-5" />,
    title: "Operator accounts",
    description:
      "You run campaigns created by the platform team — no campaign or target access.",
  },
  {
    icon: <Smartphone className="size-5" />,
    title: "Bring your devices",
    description:
      "Pair WhatsApp devices to your own account and keep full control of them.",
  },
  {
    icon: <Gauge className="size-5" />,
    title: "Transparent earnings",
    description:
      "Earnings are credited per confirmed send and tracked in an immutable ledger.",
  },
];

export default async function RegisterPage() {
  // Registration can be closed from admin settings; the action re-checks too.
  if (!(await getSetting(SETTING_KEYS.registrationEnabled))) {
    redirect("/login");
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Operator accounts run campaigns created by the platform team."
      highlights={HIGHLIGHTS}
    >
      <RegisterForm />
    </AuthShell>
  );
}
