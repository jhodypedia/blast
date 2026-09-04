import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  Clock,
  Coins,
  Gauge,
  ListChecks,
  Loader2,
  Send,
  SkipForward,
  Smartphone,
  Sigma,
  XCircle,
} from "lucide-react";

import { requireUser } from "@/lib/auth/session";
import { getUserJobDetail } from "@/lib/blast/queries";
import { isAppError } from "@/lib/errors";
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
} from "@/components/ui/page";
import { JobControls } from "@/components/blast/job-controls";
import { cn } from "@/lib/utils";

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
    <>
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link href="/dashboard/jobs">
          <ArrowLeft aria-hidden="true" />
          All jobs
        </Link>
      </Button>

      <PageHeader
        icon={<Send className="size-5" />}
        tone={
          job.status === "COMPLETED"
            ? "success"
            : job.status === "PAUSED"
              ? "warning"
              : "primary"
        }
        title={job.campaignName}
        description={`${job.deviceLabel} · ${job.speedSeconds}s · ${formatMoney(
          job.payoutPerSend,
          job.currency,
        )} per confirmed send`}
        actions={
          <Badge variant={job.status === "PAUSED" ? "warning" : "info"}>
            {job.status}
          </Badge>
        }
      />

      <PageSections>
        <SectionCard
          title="Progress"
          description={`${job.percent}% of ${job.quotaTotal} allocated recipients resolved.`}
          icon={<Activity className="size-5" />}
        >
          <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold uppercase text-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Smartphone aria-hidden="true" className="size-3.5 text-primary" />
              {job.deviceLabel}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Gauge aria-hidden="true" className="size-3.5 text-info" />
              {job.speedSeconds}s interval
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Coins aria-hidden="true" className="size-3.5 text-success" />
              {formatMoney(job.payoutPerSend, job.currency)} per send
            </span>
            <span className="ml-auto text-sm font-black text-primary">
              {job.percent}%
            </span>
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
            aria-label="Job progress"
          />

          <dl className="mt-5 grid grid-cols-2 gap-3 min-[480px]:grid-cols-4">
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
              label="In flight"
              value={job.progress.inFlight}
              tone="info"
              icon={<Loader2 className="size-3.5" />}
            />
            <Stat
              label="Failed"
              value={job.progress.failed}
              tone="danger"
              icon={<XCircle className="size-3.5" />}
            />
            <Stat
              label="Cancelled"
              value={job.progress.cancelled}
              tone="neutral"
              icon={<Ban className="size-3.5" />}
            />
            <Stat
              label="Skipped"
              value={job.progress.skipped}
              tone="neutral"
              icon={<SkipForward className="size-3.5" />}
            />
            <Stat
              label="Needs review"
              value={job.progress.needsReconciliation}
              tone="warning"
              icon={<AlertTriangle className="size-3.5" />}
            />
            <Stat
              label="Total"
              value={job.progress.total}
              tone="info"
              icon={<Sigma className="size-3.5" />}
            />
          </dl>

          <div className="mt-5 border-t-4 border-black pt-5">
            <JobControls
              blastJobId={job.id}
              status={job.status}
              allowUserPause={job.allowUserPause}
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Recent delivery events"
          description="Recipients are shown by reference only."
          icon={<ListChecks className="size-5" />}
          tone="info"
        >
          {events.length === 0 ? (
            <EmptyState
              icon={<ListChecks className="size-6" />}
              title="No delivery events yet"
              description="Events appear as the worker resolves each recipient."
            />
          ) : (
            <Stagger className="space-y-2">
              {events.map((event, index) => (
                <StaggerItem key={`${event.recipientRef}-${index}`}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-4 border-black bg-surface px-3.5 py-2.5 text-xs transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-accent">
                    <span className="truncate font-mono font-bold text-foreground">
                      {event.recipientRef.slice(0, 12)}…
                    </span>
                    <span className="font-black uppercase text-foreground">
                      {event.event}
                    </span>
                    <Badge
                      variant={
                        event.status === "SENT"
                          ? "success"
                          : event.status === "FAILED"
                            ? "danger"
                            : event.status === "RECONCILIATION_REQUIRED"
                              ? "warning"
                              : "neutral"
                      }
                    >
                      {event.status}
                    </Badge>
                    <span className="ml-auto font-mono font-bold text-foreground">
                      {event.createdAt.toISOString().slice(11, 19)} UTC
                    </span>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </SectionCard>
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
  tone: "success" | "danger" | "warning" | "info" | "neutral";
  icon: React.ReactNode;
}) {
  const tones = {
    success: "bg-success text-success-foreground",
    danger: "bg-destructive text-destructive-foreground",
    warning: "bg-warning text-warning-foreground",
    info: "bg-info text-info-foreground",
    neutral: "bg-surface text-foreground",
  } as const;

  return (
    <div className={cn("border-4 border-black p-3", tones[tone])}>
      <dt className="flex items-center gap-1.5 text-[0.6875rem] font-black uppercase tracking-widest">
        <span aria-hidden="true">{icon}</span>
        {label}
      </dt>
      <dd className="mt-1 text-lg font-black leading-none tracking-tighter">
        {value}
      </dd>
    </div>
  );
}
