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
    label: "Kampanye",
    icon: <Megaphone className="size-4 text-info" />,
  },
  {
    href: "/admin/target-lists",
    label: "Daftar nomor",
    icon: <ListChecks className="size-4 text-primary" />,
  },
  {
    href: "/admin/jobs",
    label: "Pekerjaan blast",
    icon: <ClipboardList className="size-4 text-info" />,
  },
  {
    href: "/admin/users",
    label: "Operator",
    icon: <Users className="size-4 text-muted-foreground" />,
  },
  {
    href: "/admin/withdrawals",
    label: "Penarikan",
    icon: <Wallet className="size-4 text-success" />,
  },
  {
    href: "/admin/settings",
    label: "Pengaturan",
    icon: <Settings className="size-4 text-muted-foreground" />,
  },
  {
    href: "/admin/audit",
    label: "Log audit",
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
      title="Konsol admin"
      subtitle="Kampanye, nomor, dan pembayaran"
      accountName={actor.name || actor.email}
      accountEmail={actor.email}
    >
      {children}
    </AppShell>
  );
}
