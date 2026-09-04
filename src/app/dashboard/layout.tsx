import { redirect } from "next/navigation";
import {
  LayoutDashboard,
  Send,
  Smartphone,
  UserCog,
  Wallet,
} from "lucide-react";

import { currentActor } from "@/lib/auth/session";
import { AppShell, type NavItem } from "@/components/layout/app-shell";

/**
 * Operator dashboard layout.
 *
 * The session is re-read on the server for every request; the proxy gate is only
 * the first line of defence (RULES.md §5).
 *
 * Campaign management is ADMIN-only, so the operator navigation exposes exactly
 * five destinations and no campaign entry (RULES.md §6).
 */

const NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Overview",
    icon: <LayoutDashboard className="size-4 text-primary" />,
  },
  {
    href: "/dashboard/jobs",
    label: "Blast",
    icon: <Send className="size-4 text-primary" />,
  },
  {
    href: "/dashboard/devices",
    label: "Devices",
    icon: <Smartphone className="size-4 text-success" />,
  },
  {
    href: "/dashboard/wallet",
    label: "Earnings",
    icon: <Wallet className="size-4 text-success" />,
  },
  {
    href: "/dashboard/profile",
    label: "Profile",
    icon: <UserCog className="size-4 text-foreground" />,
  },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await currentActor();

  if (!actor || actor.status !== "ACTIVE") {
    redirect("/login");
  }
  if (actor.role !== "USER") {
    redirect("/admin");
  }

  return (
    <AppShell
      items={NAV}
      title="Operator console"
      subtitle="Run assigned campaigns"
      accountName={actor.name || actor.email}
      accountEmail={actor.email}
    >
      {children}
    </AppShell>
  );
}
