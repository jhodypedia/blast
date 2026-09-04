import type { Metadata } from "next";
import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Gauge,
  ListChecks,
  Send,
  Smartphone,
  UserCog,
  XCircle,
} from "lucide-react";

import { requireAdmin } from "@/lib/auth/session";
import { listJobsForAdmin } from "@/lib/admin/job-queries";
import { Card, CardContent, IconTile } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import { EmptyState, PageHeader, PageSections } from "@/components/ui/page";
import { AdminJobStopButton } from "@/components/admin/admin-job-stop-button";

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

const LIVE = ["PENDING", "QUEUED", "RUNNING", "PAUSED"];

/** Operational view of every blast job. Recipient numbers are never shown. */
export default async function AdminJobsPage() {
  await requireAdmin();
  const jobs = await listJobsForAdmin({ limit: 100 });

  const live = jobs.filter((job) => LIVE.includes(job.status)).length;
  const review = jobs.reduce((sum, job) => sum + job.needsReconciliation, 0);

  return (
    <>
      <PageHeader
        icon={<Send className="size-5" />}
        title="Blast jobs"
        description="Delivery runs across all operators. Progress is derived from recipient states."
        actions={
          <>
            {review > 0 ? (
              <Badge variant="warning">{review} to review</Badge>
            ) : null}
            <Badge variant="info">{live} live</Badge>
            <Badge variant="neutral">{jobs.length} total</Badge>
          </>
        }
      />

      <PageSections>
        {jobs.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-6" />}
            title="No jobs yet"
            description="Blast jobs appear here as soon as an operator starts one."
          />
        ) : (
          <Stagger className="space-y-3">
            {jobs.map((job) => (
              <StaggerItem key={job.id}>
                <Card hover>
                  <CardContent className="p-4 pt-4 sm:p-5 sm:pt-5">
                    <div className="flex flex-wrap items-start gap-3.5">
                      <IconTile
                        tone={
                          job.status === "COMPLETED"
                            ? "success"
                            : job.status === "PAUSED"
                              ? "warning"
                              : job.status === "FAILED"
                                ? "danger"
                                : "primary"
                        }
                        className="mt-0.5"
                      >
                        <Send className="size-5" />
                      </IconTile>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-black uppercase tracking-tight">
                          {job.campaignName}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <UserCog
                              aria-hidden="true"
                              className="size-3.5 text-info"
                            />
                            <span className="truncate">{job.operatorEmail}</span>
                          </span>
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
                              className="size-3.5 text-warning"
                            />
                            {job.speedSeconds}s
                          </span>
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {job.needsReconciliation > 0 ? (
                          <Badge variant="warning">
                            {job.needsReconciliation} to review
                          </Badge>
                        ) : null}
                        <Badge variant={STATUS_VARIANT[job.status] ?? "neutral"}>
                          {job.status}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="mb-1.5 flex items-center justify-between text-xs font-black uppercase tracking-widest">
                        <span className="text-foreground">Progress</span>
                        <span className="text-primary">{job.percent}%</span>
                      </div>
                      <Progress
                        value={job.percent}
                        tone={
                          job.status === "PAUSED"
                            ? "warning"
                            : job.status === "FAILED"
                              ? "danger"
                              : job.status === "COMPLETED"
                                ? "success"
                                : "primary"
                        }
                        aria-label={`${job.campaignName} progress`}
                      />
                    </div>

                    <dl className="mt-4 grid grid-cols-2 gap-3 min-[480px]:grid-cols-4">
                      <Metric
                        label="Sent"
                        value={String(job.sent)}
                        tone="success"
                        icon={<CheckCircle2 className="size-3.5" />}
                      />
                      <Metric
                        label="Failed"
                        value={String(job.failed)}
                        tone="danger"
                        icon={<XCircle className="size-3.5" />}
                      />
                      <Metric
                        label="Allocated"
                        value={String(job.quotaTotal)}
                        tone="info"
                        icon={<ListChecks className="size-3.5" />}
                      />
                      <Metric
                        label="Started"
                        value={job.createdAt.toISOString().slice(0, 16)}
                        icon={<CalendarClock className="size-3.5" />}
                      />
                    </dl>

                    {LIVE.includes(job.status) ? (
                      <div className="mt-4 border-t-4 border-black pt-4">
                        <AdminJobStopButton blastJobId={job.id} />
                      </div>
                    ) : null}
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

/** Compact job counter tile. */
function Metric({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger" | "info";
  icon: React.ReactNode;
}) {
  const tones = {
    success: "bg-success text-success-foreground",
    danger: "bg-destructive text-destructive-foreground",
    info: "bg-info text-info-foreground",
  } as const;

  return (
    <div
      className={`border-4 border-black p-3 ${
        tone ? tones[tone] : "bg-surface text-foreground"
      }`}
    >
      <dt className="flex items-center gap-1.5 text-[0.6875rem] font-black uppercase tracking-widest">
        <span aria-hidden="true">{icon}</span>
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-black leading-none tracking-tight">
        {value}
      </dd>
    </div>
  );
}
