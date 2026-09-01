import type { Metadata } from "next";
import { Megaphone } from "lucide-react";

import { requireUser } from "@/lib/auth/session";
import { listCampaignsForUser } from "@/lib/campaign/service";
import { listUserDevices } from "@/lib/device/service";
import { formatMoney } from "@/lib/money";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
        <p className="text-sm text-muted-foreground">
          Campaigns assigned to you by the administrator. Recipients are managed
          centrally and are never shown here.
        </p>
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
              No campaigns are available right now. Check back later.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {campaigns.map((campaign) => (
            <Card key={campaign.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="truncate">{campaign.name}</CardTitle>
                    <CardDescription>{campaign.description}</CardDescription>
                  </div>
                  <Badge variant={campaign.startable ? "success" : "warning"}>
                    {campaign.startable ? "Available" : "Quota used"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Payout per send
                    </dt>
                    <dd className="font-medium text-success">
                      {formatMoney(campaign.payoutPerSend, campaign.currency)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Your quota
                    </dt>
                    <dd className="font-medium">
                      {campaign.quotaRemaining} of {campaign.quotaPerUser} left
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Allowed speeds
                    </dt>
                    <dd className="font-medium">
                      {campaign.allowedSpeeds.join("s, ")}s
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Ends</dt>
                    <dd className="font-medium">
                      {campaign.scheduledEndAt.toISOString().slice(0, 16)} UTC
                    </dd>
                  </div>
                </dl>

                <div className="border-t border-border pt-4">
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
          ))}
        </div>
      )}
    </div>
  );
}
