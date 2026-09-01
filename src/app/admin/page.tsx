import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone, Send, Users, Wallet } from "lucide-react";

import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getSetting } from "@/lib/settings/service";
import { SETTING_KEYS } from "@/lib/constants";
import { formatMoney, toMoneyString } from "@/lib/money";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Admin overview" };

/** Operational overview. Counts are read directly from authoritative tables. */
export default async function AdminOverviewPage() {
  await requireAdmin();
  const currency = await getSetting(SETTING_KEYS.defaultCurrency);

  const [
    activeCampaigns,
    liveJobs,
    operators,
    pendingWithdrawals,
    pendingAmount,
    reconciliation,
  ] = await Promise.all([
    prisma.campaign.count({ where: { status: "ACTIVE", archivedAt: null } }),
    prisma.blastJob.count({
      where: { status: { in: ["QUEUED", "RUNNING", "PAUSED"] } },
    }),
    prisma.user.count({ where: { role: "USER", deletedAt: null } }),
    prisma.withdrawal.count({ where: { status: "PENDING" } }),
    prisma.withdrawal.aggregate({
      where: { status: { in: ["PENDING", "PROCESSING", "APPROVED"] } },
      _sum: { netAmount: true },
    }),
    prisma.campaignRecipient.count({
      where: { status: { in: ["UNKNOWN", "RECONCILIATION_REQUIRED"] } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Platform status across campaigns, delivery and payouts.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          href="/admin/campaigns"
          label="Active campaigns"
          value={String(activeCampaigns)}
          icon={<Megaphone className="size-5 text-info" aria-hidden="true" />}
        />
        <StatCard
          href="/admin/jobs"
          label="Live blast jobs"
          value={String(liveJobs)}
          icon={<Send className="size-5 text-primary" aria-hidden="true" />}
        />
        <StatCard
          href="/admin/users"
          label="Operators"
          value={String(operators)}
          icon={
            <Users className="size-5 text-muted-foreground" aria-hidden="true" />
          }
        />
        <StatCard
          href="/admin/withdrawals"
          label="Withdrawals pending"
          value={String(pendingWithdrawals)}
          hint={formatMoney(
            toMoneyString(pendingAmount._sum.netAmount?.toString() ?? "0"),
            currency,
          )}
          icon={<Wallet className="size-5 text-success" aria-hidden="true" />}
        />
      </div>

      {reconciliation > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Reconciliation required</CardTitle>
            <CardDescription>
              {reconciliation} recipient{reconciliation === 1 ? "" : "s"} had an
              ambiguous delivery result. These are never retried automatically and
              need a manual decision.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/admin/jobs"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Review affected jobs
            </Link>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function StatCard({
  href,
  label,
  value,
  hint,
  icon,
}: {
  href: string;
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
}) {
  return (
    <Link href={href} className="block">
      <Card className="transition-colors hover:bg-accent/40">
        <CardContent className="flex items-start justify-between gap-3 p-5">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="mt-1 truncate text-xl font-semibold">{value}</p>
            {hint ? (
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {hint}
              </p>
            ) : null}
          </div>
          <span className="shrink-0 rounded-lg bg-muted p-2">{icon}</span>
        </CardContent>
      </Card>
    </Link>
  );
}
