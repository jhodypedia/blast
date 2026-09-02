import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarRange,
  CheckCircle2,
  ChevronRight,
  Coins,
  ListChecks,
  Megaphone,
  Plus,
  Send,
  Users,
} from "lucide-react";

import { requireAdmin } from "@/lib/auth/session";
import { listCampaignsForAdmin } from "@/lib/admin/queries";
import { formatMoney } from "@/lib/money";
import { Card, CardContent, IconTile } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import { EmptyState, PageHeader, PageSections } from "@/components/ui/page";
import { CampaignTransitionControls } from "@/components/admin/campaign-transition-controls";

export const metadata: Metadata = { title: "Campaigns" };

const STATUS_VARIANT: Record<
  string,
  "success" | "warning" | "danger" | "info" | "neutral" | "primary"
> = {
  DRAFT: "neutral",
  SCHEDULED: "info",
  ACTIVE: "success",
  PAUSED: "warning",
  COMPLETED: "success",
  PARTIAL_FAILED: "warning",
  CANCELLED: "neutral",
  EXPIRED: "neutral",
  ARCHIVED: "neutral",
};

/** Campaign list with lifecycle controls. ADMIN only. */
export default async function AdminCampaignsPage() {
  await requireAdmin();
  const { campaigns, total } = await listCampaignsForAdmin({ pageSize: 50 });

  return (
    <>
      <PageHeader
        icon={<Megaphone className="size-5" />}
        tone="info"
        title="Campaigns"
        description="Only admins can create or change a campaign."
        actions={
          <>
            <Badge variant="info">{total} total</Badge>
            <Button asChild>
              <Link href="/admin/campaigns/new">
                <Plus aria-hidden="true" />
                New campaign
              </Link>
            </Button>
          </>
        }
      />

      <PageSections>
        {campaigns.length === 0 ? (
          <EmptyState
            icon={<Megaphone className="size-6" />}
            title="No campaigns yet"
            description="Upload a target list first, then create a campaign to allocate recipients to operators."
            action={
              <Button asChild>
                <Link href="/admin/campaigns/new">
                  <Plus aria-hidden="true" />
                  New campaign
                </Link>
              </Button>
            }
          />
        ) : (
          <Stagger className="space-y-4">
            {campaigns.map((campaign) => (
              <StaggerItem key={campaign.id}>
                <Card hover>
                  <CardContent className="p-5 pt-5 sm:p-6 sm:pt-6">
                    <div className="flex flex-wrap items-start gap-3.5">
                      <IconTile
                        tone={
                          campaign.status === "ACTIVE"
                            ? "success"
                            : campaign.status === "PAUSED"
                              ? "warning"
                              : "info"
                        }
                        className="mt-0.5"
                      >
                        <Megaphone className="size-5" />
                      </IconTile>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/admin/campaigns/${campaign.id}`}
                          className="group inline-flex max-w-full items-center gap-1 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          <span className="truncate text-base font-bold tracking-tight group-hover:text-primary">
                            {campaign.name}
                          </span>
                          <ChevronRight
                            aria-hidden="true"
                            className="size-4 shrink-0 text-primary transition-transform duration-200 group-hover:translate-x-0.5"
                          />
                        </Link>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <ListChecks
                              aria-hidden="true"
                              className="size-3.5 text-info"
                            />
                            {campaign.targetListName} · {campaign.targetCount}{" "}
                            numbers
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Coins
                              aria-hidden="true"
                              className="size-3.5 text-success"
                            />
                            {formatMoney(
                              campaign.payoutPerSend,
                              campaign.currency,
                            )}{" "}
                            per send
                          </span>
                        </p>
                      </div>
                      <Badge
                        variant={STATUS_VARIANT[campaign.status] ?? "neutral"}
                      >
                        {campaign.status}
                      </Badge>
                    </div>

                    <dl className="mt-4 grid grid-cols-2 gap-3 min-[480px]:grid-cols-4">
                      <Metric
                        label="Allocated"
                        value={campaign.recipientCount}
                        icon={<ListChecks className="size-3.5 text-info" />}
                      />
                      <Metric
                        label="Sent"
                        value={campaign.sentCount}
                        tone="success"
                        icon={<CheckCircle2 className="size-3.5" />}
                      />
                      <Metric
                        label="Jobs"
                        value={campaign.jobCount}
                        icon={<Send className="size-3.5 text-primary" />}
                      />
                      <Metric
                        label="Quota / user"
                        value={campaign.quotaPerUser}
                        icon={<Users className="size-3.5 text-warning" />}
                      />
                    </dl>

                    <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <CalendarRange
                        aria-hidden="true"
                        className="size-3.5 shrink-0 text-info"
                      />
                      {campaign.scheduledStartAt.toISOString().slice(0, 16)} →{" "}
                      {campaign.scheduledEndAt.toISOString().slice(0, 16)} UTC
                    </p>

                    <div className="mt-4 border-t border-border/70 pt-4">
                      <CampaignTransitionControls
                        campaignId={campaign.id}
                        status={campaign.status}
                      />
                    </div>
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

/** Compact campaign counter tile. */
function Metric({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone?: "success";
  icon: React.ReactNode;
}) {
  return (
    <div
      className={
        tone === "success"
          ? "rounded-lg border border-success/25 bg-success/8 p-3 text-success"
          : "rounded-lg border border-border bg-surface/60 p-3 text-muted-foreground"
      }
    >
      <dt className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider">
        <span aria-hidden="true">{icon}</span>
        {label}
      </dt>
      <dd className="mt-1 text-lg font-bold text-foreground">{value}</dd>
    </div>
  );
}
