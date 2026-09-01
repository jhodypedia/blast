import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { requireUser } from "@/lib/auth/session";
import { getUserJobDetail } from "@/lib/blast/queries";
import { isAppError } from "@/lib/errors";
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

export const metadata: Metadata = { title: "Blast job" };

/**
 * One job the caller owns.
 *
 * Delivery events show only the non-reversible recipient reference: an operator
 * must never see a target number (RULES.md §10).
 */
export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ blastJobId: string }>;
}) {
  const actor = await requireUser();
  const { blastJobId } = await params;

  let detail;
  try {
    detail = await getUserJobDetail({ userId: actor.id, blastJobId });
  } catch (error) {
    if (isAppError(error) && ["NOT_FOUND", "FORBIDDEN"].includes(error.code)) {
      notFound();
    }
    throw error;
  }

  const { job, events } = detail;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/jobs"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          All jobs
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {job.campaignName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {job.deviceLabel} · {job.speedSeconds}s ·{" "}
            {formatMoney(job.payoutPerSend, job.currency)} per confirmed send
          </p>
        </div>
        <Badge variant={job.status === "PAUSED" ? "warning" : "info"}>
          {job.status}
        </Badge>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Progress</CardTitle>
          <CardDescription>
            {job.percent}% of {job.quotaTotal} allocated recipients resolved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            role="progressbar"
            aria-valuenow={job.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Job progress"
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-success"
              style={{ width: `${job.percent}%` }}
            />
          </div>

          <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <Stat label="Sent" value={job.progress.sent} tone="success" />
            <Stat label="Pending" value={job.progress.pending} />
            <Stat label="In flight" value={job.progress.inFlight} />
            <Stat label="Failed" value={job.progress.failed} tone="danger" />
            <Stat label="Cancelled" value={job.progress.cancelled} />
            <Stat label="Skipped" value={job.progress.skipped} />
            <Stat
              label="Needs review"
              value={job.progress.needsReconciliation}
              tone="warning"
            />
            <Stat label="Total" value={job.progress.total} />
          </dl>

          <JobControls
            blastJobId={job.id}
            status={job.status}
            allowUserPause={job.allowUserPause}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent delivery events</CardTitle>
          <CardDescription>
            Recipients are shown by reference only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {events.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No delivery events recorded yet.
              </p>
            </div>
          ) : (
            events.map((event, index) => (
              <div
                key={`${event.recipientRef}-${index}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-xs"
              >
                <span className="truncate font-mono text-muted-foreground">
                  {event.recipientRef.slice(0, 12)}…
                </span>
                <span className="font-medium">{event.event}</span>
                <span className="text-muted-foreground">{event.status}</span>
                <span className="text-muted-foreground">
                  {event.createdAt.toISOString().slice(11, 19)}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
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
          : "";

  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`font-semibold ${toneClass}`}>{value}</dd>
    </div>
  );
}
