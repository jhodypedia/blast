import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Activity,
  Megaphone,
  Send,
  Smartphone,
  Wallet,
} from "lucide-react";

import { requireUser } from "@/lib/auth/session";
import { listUserDevices } from "@/lib/device/service";
import { listCampaignsForUser } from "@/lib/campaign/service";
import { listUserJobs } from "@/lib/blast/queries";
import { getBalance } from "@/lib/ledger/service";
import { getSetting } from "@/lib/settings/service";
import { SETTING_KEYS } from "@/lib/constants";
import { formatMoney } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import {
  EmptyState,
  PageHeader,
  PageSections,
  SectionCard,
  StatCard,
  StatGrid,
} from "@/components/ui/page";

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
    <>
      <PageHeader
        icon={<Activity className="size-5" />}
        title={`Welcome back${actor.name ? `, ${actor.name}` : ""}`}
        description="Your devices, available campaigns and earnings at a glance."
        actions={
          <Button asChild>
            <Link href="/dashboard/campaigns">
              <Megaphone aria-hidden="true" />
              Browse campaigns
            </Link>
          </Button>
        }
      />

      <PageSections>
        <StatGrid>
          <StatCard
            label="Available balance"
            tone="success"
            value={formatMoney(balance.available, currency)}
            hint={
              balance.held === "0.0000"
                ? "No withdrawals on hold"
                : `${formatMoney(balance.held, currency)} on hold`
            }
            icon={<Wallet className="size-5" />}
          />
          <StatCard
            label="Connected devices"
            tone="primary"
            value={`${connected} / ${devices.length}`}
            hint="Connected of registered"
            icon={<Smartphone className="size-5" />}
          />
          <StatCard
            label="Campaigns available"
            tone="info"
            value={String(campaigns.filter((c) => c.startable).length)}
            hint={`${campaigns.length} assigned to you`}
            icon={<Megaphone className="size-5" />}
          />
          <StatCard
            label="Running jobs"
            tone="warning"
            value={String(jobs.length)}
            hint="Queued, running or paused"
            icon={<Send className="size-5" />}
          />
        </StatGrid>

        <SectionCard
          title="Live jobs"
          description="Progress is calculated from confirmed delivery records."
          icon={<Send className="size-5" />}
          actions={
            jobs.length > 0 ? (
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard/jobs">
                  All jobs
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            ) : undefined
          }
        >
          {jobs.length === 0 ? (
            <EmptyState
              icon={<Send className="size-6" />}
              title="No jobs running"
              description="Pick an available campaign to start your first blast job."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/campaigns">
                    Browse campaigns
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              }
            />
          ) : (
            <Stagger className="space-y-3">
              {jobs.map((job) => (
                <StaggerItem key={job.id}>
                  <Link
                    href={`/dashboard/jobs/${job.id}`}
                    className="lift block rounded-xl border border-border bg-surface/60 p-4 hover:border-primary/45 hover:bg-surface hover:shadow-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {job.campaignName}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {job.deviceLabel} · {job.speedSeconds}s ·{" "}
                          {job.progress.sent}/{job.quotaTotal} sent
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge
                          variant={job.status === "PAUSED" ? "warning" : "info"}
                        >
                          {job.status}
                        </Badge>
                        <span className="text-sm font-bold text-primary">
                          {job.percent}%
                        </span>
                      </div>
                    </div>
                    <Progress
                      value={job.percent}
                      tone={job.status === "PAUSED" ? "warning" : "primary"}
                      className="mt-3"
                      aria-label={`${job.campaignName} delivery progress`}
                    />
                  </Link>
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </SectionCard>
      </PageSections>
    </>
  );
}
