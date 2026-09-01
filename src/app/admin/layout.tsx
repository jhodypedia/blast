import { redirect } from "next/navigation";
import {
  ClipboardList,
  Gauge,
  ListChecks,
  Megaphone,
  ScrollText,
  Settings,
  Users,
  Wallet,
} from "lucide-react";

import { currentActor } from "@/lib/auth/session";
import { AppShell, type NavItem } from "@/components/layout/app-shell";

/**
 * Admin layout. ADMIN is the only role permitted past this point; the check is
 * repeated in every admin action and service (RULES.md §5).
 */

const NAV: NavItem[] = [
  {
    href: "/admin",
    label: "Overview",
    icon: <Gauge className="size-4 text-primary" />,
  },
  {
    href: "/admin/campaigns",
    label: "Campaigns",
    icon: <Megaphone className="size-4 text-info" />,
  },
  {
    href: "/admin/target-lists",
    label: "Target lists",
    icon: <ListChecks className="size-4 text-primary" />,
  },
  {
    href: "/admin/jobs",
    label: "Blast jobs",
    icon: <ClipboardList className="size-4 text-info" />,
  },
  {
    href: "/admin/users",
    label: "Operators",
    icon: <Users className="size-4 text-muted-foreground" />,
  },
  {
    href: "/admin/withdrawals",
    label: "Withdrawals",
    icon: <Wallet className="size-4 text-success" />,
  },
  {
    href: "/admin/settings",
    label: "Settings",
    icon: <Settings className="size-4 text-muted-foreground" />,
  },
  {
    href: "/admin/audit",
    label: "Audit log",
    icon: <ScrollText className="size-4 text-warning" />,
  },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await currentActor();

  if (!actor || actor.status !== "ACTIVE") {
    redirect("/login");
  }
  if (actor.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <AppShell
      items={NAV}
      title="Admin console"
      subtitle="Campaigns, targets and payouts"
      accountName={actor.name || actor.email}
      accountEmail={actor.email}
    >
      {children}
    </AppShell>
  );
}
