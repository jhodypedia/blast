import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Coins,
  Gauge,
  Megaphone,
  Send,
  Smartphone,
  XCircle,
} from "lucide-react";

import { requireUser } from "@/lib/auth/session";
import { listUserJobs } from "@/lib/blast/queries";
import { formatMoney } from "@/lib/money";
import { Card, CardContent, IconTile } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress, type ProgressTone } from "@/components/ui/progress";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import { EmptyState, PageHeader, PageSections } from "@/components/ui/page";
import { JobControls } from "@/components/blast/job-controls";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Blast jobs" };

const STATUS_VARIANT: Record<
  string,
  "success" | "warning" | "danger" | "info" | "neutral"
> = {
  PENDING: "neutral",
  QUEUED: "info",
  RUNNING: "info",
  PAUSED: "warning",
  COMPLETED: "success",
  PARTIAL_FAILED: "warning",
  CANCELLED: "neutral",
  FAILED: "danger",
};

const PROGRESS_TONE: Record<string, ProgressTone> = {
  PAUSED: "warning",
  COMPLETED: "success",
  PARTIAL_FAILED: "warning",
  FAILED: "danger",
  CANCELLED: "info",
};

/** The operator's own jobs. Progress comes from recipient rows, not counters. */
export default async function JobsPage() {
  const actor = await requireUser();
  const jobs = await listUserJobs(actor.id, { limit: 50 });

  const live = jobs.filter((job) =>
    ["PENDING", "QUEUED", "RUNNING", "PAUSED"].includes(job.status),
  ).length;

  return (
    <>
      <PageHeader
        icon={<Send className="size-5" />}
        title="Blast jobs"
        description="Your delivery runs. Earnings are credited only for confirmed sends."
        actions={
          <>
            {jobs.length > 0 ? (
              <Badge variant={live > 0 ? "info" : "neutral"}>
                {live} live · {jobs.length} total
              </Badge>
            ) : null}
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/campaigns">
                <Megaphone aria-hidden="true" />
                Campaigns
              </Link>
            </Button>
          </>
        }
      />

      <PageSections>
        {jobs.length === 0 ? (
          <EmptyState
            icon={<Send className="size-6" />}
            title="No jobs yet"
            description="Start a job from an assigned campaign and its progress will appear here."
            action={
              <Button asChild size="sm">
                <Link href="/dashboard/campaigns">
                  <Megaphone aria-hidden="true" />
                  Browse campaigns
                </Link>
              </Button>
            }
          />
        ) : (
          <Stagger className="space-y-4">
            {jobs.map((job) => (
              <StaggerItem key={job.id}>
                <Card hover>
                  <div className="flex flex-wrap items-start gap-3.5 border-b border-border/70 p-5 sm:p-6">
                    <IconTile
                      tone={
                        job.status === "COMPLETED"
                          ? "success"
                          : job.status === "FAILED"
                            ? "danger"
                            : job.status === "PAUSED"
                              ? "warning"
                              : "primary"
                      }
                      className="mt-0.5"
                    >
                      <Send className="size-5" />
                    </IconTile>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-base font-bold tracking-tight sm:text-lg">
                        <Link
                          href={`/dashboard/jobs/${job.id}`}
                          className="rounded underline-offset-4 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          {job.campaignName}
                        </Link>
                      </h2>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <Smartphone
                            aria-hidden="true"
                            className="size-3.5 text-primary"
                          />
                          {job.deviceLabel}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Gauge
                            aria-hidden="true"
                            className="size-3.5 text-info"
                          />
                          {job.speedSeconds}s
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Coins
                            aria-hidden="true"
                            className="size-3.5 text-success"
                          />
                          {formatMoney(job.payoutPerSend, job.currency)} per send
                        </span>
                      </p>
                    </div>
                    <Badge variant={STATUS_VARIANT[job.status] ?? "neutral"}>
                      {job.status}
                    </Badge>
                  </div>

                  <CardContent className="space-y-5 p-5 pt-5 sm:p-6 sm:pt-6">
                    <div>
                      <div className="mb-2 flex items-center justify-between text-xs font-semibold">
                        <span className="text-muted-foreground">
                          {job.progress.sent} / {job.quotaTotal} delivered
                        </span>
                        <span className="text-primary">{job.percent}%</span>
                      </div>
                      <Progress
                        value={job.percent}
                        tone={PROGRESS_TONE[job.status] ?? "primary"}
                        aria-label={`${job.campaignName} progress`}
                      />
                      <dl className="mt-4 grid grid-cols-2 gap-3 min-[480px]:grid-cols-4">
                        <Stat
                          label="Sent"
                          value={job.progress.sent}
                          tone="success"
                          icon={<CheckCircle2 className="size-3.5" />}
                        />
                        <Stat
                          label="Pending"
                          value={job.progress.pending}
                          tone="neutral"
                          icon={<Clock className="size-3.5" />}
                        />
                        <Stat
                          label="Failed"
                          value={job.progress.failed}
                          tone="danger"
                          icon={<XCircle className="size-3.5" />}
                        />
                        <Stat
                          label="Review"
                          value={job.progress.needsReconciliation}
                          tone="warning"
                          icon={<AlertTriangle className="size-3.5" />}
                        />
                      </dl>
                    </div>

                    <JobControls
                      blastJobId={job.id}
                      status={job.status}
                      allowUserPause={job.allowUserPause}
                    />
                  </CardContent>
                </Card>
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </PageSections>
    </>
  );
}

/** Compact recipient-state counter tile. */
function Stat({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "success" | "danger" | "warning" | "neutral";
  icon: React.ReactNode;
}) {
  const tones = {
    success: "border-success/25 bg-success/8 text-success",
    danger: "border-destructive/25 bg-destructive/8 text-destructive",
    warning: "border-warning/25 bg-warning/8 text-warning",
    neutral: "border-border bg-surface/60 text-muted-foreground",
  } as const;

  return (
    <div className={cn("rounded-lg border p-3", tones[tone])}>
      <dt className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider">
        <span aria-hidden="true">{icon}</span>
        {label}
      </dt>
      <dd className="mt-1 text-lg font-bold text-foreground">{value}</dd>
    </div>
  );
}
