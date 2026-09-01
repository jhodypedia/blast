import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone, Plus } from "lucide-react";

import { requireAdmin } from "@/lib/auth/session";
import { listCampaignsForAdmin } from "@/lib/admin/queries";
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
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            {total} campaign{total === 1 ? "" : "s"}. Only admins can create or
            change a campaign.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/campaigns/new">
            <Plus aria-hidden="true" />
            New campaign
          </Link>
        </Button>
      </header>

      {campaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <span className="rounded-full bg-muted p-3">
              <Megaphone
                className="size-6 text-muted-foreground"
                aria-hidden="true"
              />
            </span>
            <p className="text-sm text-muted-foreground">
              No campaigns yet. Upload a target list, then create a campaign.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {campaigns.map((campaign) => (
            <Card key={campaign.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="truncate">
                      <Link
                        href={`/admin/campaigns/${campaign.id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {campaign.name}
                      </Link>
                    </CardTitle>
                    <CardDescription>
                      {campaign.targetListName} · {campaign.targetCount}{" "}
                      numbers ·{" "}
                      {formatMoney(campaign.payoutPerSend, campaign.currency)}{" "}
                      per send
                    </CardDescription>
                  </div>
                  <Badge variant={STATUS_VARIANT[campaign.status] ?? "neutral"}>
                    {campaign.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                  <Metric label="Allocated" value={campaign.recipientCount} />
                  <Metric
                    label="Sent"
                    value={campaign.sentCount}
                    tone="success"
                  />
                  <Metric label="Jobs" value={campaign.jobCount} />
                  <Metric label="Quota / user" value={campaign.quotaPerUser} />
                </dl>

                <p className="text-xs text-muted-foreground">
                  {campaign.scheduledStartAt.toISOString().slice(0, 16)} →{" "}
                  {campaign.scheduledEndAt.toISOString().slice(0, 16)} UTC
                </p>

                <CampaignTransitionControls
                  campaignId={campaign.id}
                  status={campaign.status}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success";
}) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={
          tone === "success" ? "font-semibold text-success" : "font-semibold"
        }
      >
        {value}
      </dd>
    </div>
  );
}
