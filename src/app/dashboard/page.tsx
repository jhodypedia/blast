import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Megaphone, Send, Smartphone, Wallet } from "lucide-react";

import { requireUser } from "@/lib/auth/session";
import { listUserDevices } from "@/lib/device/service";
import { listCampaignsForUser } from "@/lib/campaign/service";
import { listUserJobs } from "@/lib/blast/queries";
import { getBalance } from "@/lib/ledger/service";
import { getSetting } from "@/lib/settings/service";
import { SETTING_KEYS } from "@/lib/constants";
import { formatMoney } from "@/lib/money";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Overview" };

/**
 * Operator overview.
 *
 * Every figure is read server-side from authoritative rows: balances from the
 * ledger, progress from recipient states (RULES.md §11, §14).
 */
export default async function DashboardPage() {
  const actor = await requireUser();
  const currency = await getSetting(SETTING_KEYS.defaultCurrency);

  const [devices, campaigns, jobs, balance] = await Promise.all([
    listUserDevices(actor.id),
    listCampaignsForUser(actor.id),
    listUserJobs(actor.id, { onlyLive: true, limit: 5 }),
    getBalance(actor.id, currency),
  ]);

  const connected = devices.filter(
    (device) => device.status === "CONNECTED",
  ).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back{actor.name ? `, ${actor.name}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          Your devices, available campaigns and earnings at a glance.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Available balance"
          value={formatMoney(balance.available, currency)}
          hint={
            balance.held === "0.0000"
              ? "No withdrawals on hold"
              : `${formatMoney(balance.held, currency)} on hold`
          }
          icon={<Wallet className="size-5 text-success" aria-hidden="true" />}
        />
        <StatCard
          label="Connected devices"
          value={`${connected} / ${devices.length}`}
          hint="Connected of registered"
          icon={
            <Smartphone className="size-5 text-primary" aria-hidden="true" />
          }
        />
        <StatCard
          label="Campaigns available"
          value={String(campaigns.filter((c) => c.startable).length)}
          hint={`${campaigns.length} assigned to you`}
          icon={<Megaphone className="size-5 text-info" aria-hidden="true" />}
        />
        <StatCard
          label="Running jobs"
          value={String(jobs.length)}
          hint="Queued, running or paused"
          icon={<Send className="size-5 text-primary" aria-hidden="true" />}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Live jobs</CardTitle>
          <CardDescription>
            Progress is calculated from confirmed delivery records.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {jobs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No jobs are running. Pick an available campaign to start one.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link href="/dashboard/campaigns">
                  Browse campaigns
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
          ) : (
            jobs.map((job) => (
              <Link
                key={job.id}
                href={`/dashboard/jobs/${job.id}`}
                className="flex min-h-11 flex-col gap-2 rounded-lg border border-border p-4 transition-colors hover:bg-accent/50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {job.campaignName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {job.deviceLabel} · {job.speedSeconds}s ·{" "}
                    {job.progress.sent}/{job.quotaTotal} sent
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={job.status === "PAUSED" ? "warning" : "info"}>
                    {job.status}
                  </Badge>
                  <span className="text-sm font-medium">{job.percent}%</span>
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 truncate text-xl font-semibold">{value}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
        </div>
        <span className="shrink-0 rounded-lg bg-muted p-2">{icon}</span>
      </CardContent>
    </Card>
  );
}
