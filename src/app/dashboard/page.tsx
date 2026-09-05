import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Activity,
  ListChecks,
  Send,
  Smartphone,
  Wallet,
} from "lucide-react";

import { requireUser } from "@/lib/auth/session";
import { listUserDevices } from "@/lib/device/service";
import {
  listCampaignsForUser,
  remainingAllocation,
} from "@/lib/campaign/service";
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
  const allocationLeft = remainingAllocation(campaigns);

  return (
    <>
      <PageHeader
        icon={<Activity className="size-5" />}
        title={`Welcome back${actor.name ? `, ${actor.name}` : ""}`}
        description="Perangkat, alokasi nomor, dan penghasilan Anda dalam satu tampilan."
        actions={
          <Button asChild>
            <Link href="/dashboard/devices">
              <Smartphone aria-hidden="true" />
              Buka perangkat
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
            label="Alokasi nomor tersisa"
            tone="info"
            value={String(allocationLeft)}
            hint="Nomor yang bisa Anda kirimi"
            icon={<ListChecks className="size-5" />}
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
          title="Blast berjalan"
          description="Progres dihitung dari catatan pengiriman yang terkonfirmasi."
          icon={<Send className="size-5" />}
          actions={
            jobs.length > 0 ? (
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard/devices">
                  Semua perangkat
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            ) : undefined
          }
        >
          {jobs.length === 0 ? (
            <EmptyState
              icon={<Send className="size-6" />}
              title="Belum ada blast berjalan"
              description="Mulai blast dari halaman perangkat setelah ada perangkat terhubung."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/devices">
                    Buka perangkat
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
                    href="/dashboard/devices"
                    className="lift block border-4 border-black bg-surface p-4 hover:bg-accent focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black uppercase text-foreground">
                          {job.deviceLabel}
                        </p>
                        <p className="mt-0.5 text-xs font-bold text-foreground">
                          {job.devicePublicId} · {job.speedSeconds}s ·{" "}
                          {job.progress.sent}/{job.quotaTotal} terkirim
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
                      aria-label={`${job.deviceLabel} delivery progress`}
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
