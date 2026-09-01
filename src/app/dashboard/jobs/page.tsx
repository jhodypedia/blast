import type { Metadata } from "next";
import Link from "next/link";
import { Send } from "lucide-react";

import { requireUser } from "@/lib/auth/session";
import { listUserJobs } from "@/lib/blast/queries";
import { formatMoney } from "@/lib/money";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { JobControls } from "@/components/blast/job-controls";

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

/** The operator's own jobs. Progress comes from recipient rows, not counters. */
export default async function JobsPage() {
  const actor = await requireUser();
  const jobs = await listUserJobs(actor.id, { limit: 50 });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Blast jobs</h1>
        <p className="text-sm text-muted-foreground">
          Your delivery runs. Earnings are credited only for confirmed sends.
        </p>
      </header>

      {jobs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <span className="rounded-full bg-muted p-3">
              <Send
                className="size-6 text-muted-foreground"
                aria-hidden="true"
              />
            </span>
            <p className="text-sm text-muted-foreground">
              You have not started any jobs yet.
            </p>
            <Link
              href="/dashboard/campaigns"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Browse available campaigns
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <Card key={job.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="truncate">
                      <Link
                        href={`/dashboard/jobs/${job.id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {job.campaignName}
                      </Link>
                    </CardTitle>
                    <CardDescription>
                      {job.deviceLabel} · {job.speedSeconds}s ·{" "}
                      {formatMoney(job.payoutPerSend, job.currency)} per send
                    </CardDescription>
                  </div>
                  <Badge variant={STATUS_VARIANT[job.status] ?? "neutral"}>
                    {job.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div
                    role="progressbar"
                    aria-valuenow={job.percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${job.campaignName} progress`}
                    className="h-2 w-full overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className="h-full rounded-full bg-success transition-transform"
                      style={{ width: `${job.percent}%` }}
                    />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <Stat label="Sent" value={job.progress.sent} tone="success" />
                    <Stat label="Pending" value={job.progress.pending} />
                    <Stat label="Failed" value={job.progress.failed} tone="danger" />
                    <Stat
                      label="Review"
                      value={job.progress.needsReconciliation}
                      tone="warning"
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
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "danger" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "danger"
        ? "text-destructive"
        : tone === "warning"
          ? "text-warning-foreground"
          : "text-foreground";

  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`font-semibold ${toneClass}`}>{value}</dd>
    </div>
  );
}
