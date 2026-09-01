import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";

import { requireAdmin } from "@/lib/auth/session";
import { listJobsForAdmin } from "@/lib/admin/job-queries";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Blast jobs</h1>
        <p className="text-sm text-muted-foreground">
          Delivery runs across all operators. Progress is derived from recipient
          states.
        </p>
      </header>

      {jobs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <span className="rounded-full bg-muted p-3">
              <ClipboardList
                className="size-6 text-muted-foreground"
                aria-hidden="true"
              />
            </span>
            <p className="text-sm text-muted-foreground">No jobs yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <Card key={job.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="truncate">
                      {job.campaignName}
                    </CardTitle>
                    <CardDescription className="truncate">
                      {job.operatorEmail} · {job.deviceLabel} ·{" "}
                      {job.speedSeconds}s
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
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
              </CardHeader>
              <CardContent className="space-y-3">
                <div
                  role="progressbar"
                  aria-valuenow={job.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${job.campaignName} progress`}
                  className="h-2 w-full overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-success"
                    style={{ width: `${job.percent}%` }}
                  />
                </div>

                <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                  <div>
                    <dt className="text-muted-foreground">Sent</dt>
                    <dd className="font-semibold text-success">{job.sent}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Failed</dt>
                    <dd className="font-semibold text-destructive">
                      {job.failed}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Allocated</dt>
                    <dd className="font-semibold">{job.quotaTotal}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Started</dt>
                    <dd className="font-medium">
                      {job.createdAt.toISOString().slice(0, 16)}
                    </dd>
                  </div>
                </dl>

                {LIVE.includes(job.status) ? (
                  <div className="border-t border-border pt-3">
                    <AdminJobStopButton blastJobId={job.id} />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
