import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarClock,
  Coins,
  Gauge,
  Megaphone,
  ShieldAlert,
  Smartphone,
  Target,
} from "lucide-react";

import { requireUser } from "@/lib/auth/session";
import { listCampaignsForUser } from "@/lib/campaign/service";
import { listUserDevices } from "@/lib/device/service";
import { formatMoney } from "@/lib/money";
import { Card, CardContent, IconTile } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import {
  DetailRow,
  EmptyState,
  Notice,
  PageHeader,
  PageSections,
} from "@/components/ui/page";
import { StartBlastForm } from "@/components/blast/start-blast-form";

export const metadata: Metadata = { title: "Campaigns" };

/**
 * Campaigns available to the signed-in operator.
 *
 * The projection comes from `listCampaignsForUser`, which excludes target lists,
 * internal notes and every recipient number (RULES.md §6, §10).
 */
export default async function UserCampaignsPage() {
  const actor = await requireUser();

  const [campaigns, devices] = await Promise.all([
    listCampaignsForUser(actor.id),
    listUserDevices(actor.id),
  ]);

  const connectedDevices = devices
    .filter((device) => device.status === "CONNECTED")
    .map((device) => ({ id: device.id, label: device.label }));

  const startable = campaigns.filter((campaign) => campaign.startable).length;

  return (
    <>
      <PageHeader
        icon={<Megaphone className="size-5" />}
        title="Campaigns"
        description="Campaigns assigned to you by the administrator. Recipients are managed centrally and are never shown here."
        actions={
          campaigns.length > 0 ? (
            <Badge variant={startable > 0 ? "success" : "warning"}>
              {startable} available · {campaigns.length} assigned
            </Badge>
          ) : undefined
        }
      />

      <PageSections>
        {connectedDevices.length === 0 && campaigns.length > 0 ? (
          <Notice
            tone="warning"
            icon={<ShieldAlert className="size-5" />}
            title="No connected device"
          >
            Pair and connect a device before starting a blast job.{" "}
            <Link
              href="/dashboard/devices"
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              Manage devices
            </Link>
          </Notice>
        ) : null}

        {campaigns.length === 0 ? (
          <EmptyState
            icon={<Megaphone className="size-6" />}
            title="No campaigns available"
            description="Nothing is assigned to your account right now. Check back later or contact the platform team."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard">
                  <Smartphone aria-hidden="true" />
                  Back to overview
                </Link>
              </Button>
            }
          />
        ) : (
          <Stagger className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {campaigns.map((campaign) => (
              <StaggerItem key={campaign.id}>
                <Card hover className="flex h-full flex-col">
                  <div className="flex items-start gap-3.5 border-b border-border/70 p-5 sm:p-6">
                    <IconTile
                      tone={campaign.startable ? "success" : "warning"}
                      className="mt-0.5"
                    >
                      <Megaphone className="size-5" />
                    </IconTile>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="truncate text-base font-bold tracking-tight sm:text-lg">
                          {campaign.name}
                        </h2>
                        <Badge
                          variant={campaign.startable ? "success" : "warning"}
                        >
                          {campaign.startable ? "Available" : "Quota used"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {campaign.description}
                      </p>
                    </div>
                  </div>

                  <CardContent className="flex flex-1 flex-col p-5 pt-4 sm:p-6 sm:pt-5">
                    <dl>
                      <DetailRow
                        label="Payout per send"
                        icon={<Coins className="size-4 text-success" />}
                        value={
                          <span className="font-bold text-success">
                            {formatMoney(
                              campaign.payoutPerSend,
                              campaign.currency,
                            )}
                          </span>
                        }
                      />
                      <DetailRow
                        label="Your quota"
                        icon={<Target className="size-4 text-info" />}
                        value={`${campaign.quotaRemaining} of ${campaign.quotaPerUser} left`}
                      />
                      <DetailRow
                        label="Allowed speeds"
                        icon={<Gauge className="size-4 text-primary" />}
                        value={`${campaign.allowedSpeeds.join("s, ")}s`}
                      />
                      <DetailRow
                        label="Ends"
                        icon={<CalendarClock className="size-4 text-warning" />}
                        value={`${campaign.scheduledEndAt
                          .toISOString()
                          .slice(0, 16)
                          .replace("T", " ")} UTC`}
                      />
                    </dl>

                    <div className="mt-5 border-t border-border/70 pt-5">
                      <StartBlastForm
                        campaignId={campaign.id}
                        devices={connectedDevices}
                        allowedSpeeds={campaign.allowedSpeeds}
                        requireTermsAccept={campaign.requireTermsAccept}
                        disabled={!campaign.startable}
                        disabledReason="You have used your full quota for this campaign."
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
