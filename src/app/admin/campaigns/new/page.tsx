import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getSetting } from "@/lib/settings/service";
import { SETTING_KEYS } from "@/lib/constants";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CampaignForm } from "@/components/admin/campaign-form";

export const metadata: Metadata = { title: "New campaign" };

/** Returns a `datetime-local` value offset from now, in UTC. */
function utcLocal(offsetHours: number): string {
  return new Date(Date.now() + offsetHours * 3_600_000)
    .toISOString()
    .slice(0, 16);
}

export default async function NewCampaignPage() {
  await requireAdmin();

  const [lists, operators, defaultPayout, defaultCurrency] = await Promise.all([
    prisma.targetList.findMany({
      where: { status: "READY", archivedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, importedCount: true },
    }),
    prisma.user.findMany({
      where: { role: "USER", status: "ACTIVE", deletedAt: null },
      orderBy: { email: "asc" },
      select: { id: true, email: true, name: true },
    }),
    getSetting(SETTING_KEYS.defaultPayoutPerSend),
    getSetting(SETTING_KEYS.defaultCurrency),
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">New campaign</h1>
        <p className="text-sm text-muted-foreground">
          Campaigns are created as drafts. Activate one when it is ready to run.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Campaign details</CardTitle>
          <CardDescription>
            Only administrators can create or change a campaign. Operators can
            only start jobs against it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {lists.length === 0 ? (
            <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning-foreground">
              Upload and import a target list before creating a campaign.
            </p>
          ) : (
            <CampaignForm
              targetLists={lists.map((list) => ({
                id: list.id,
                label: `${list.name} (${list.importedCount} numbers)`,
              }))}
              operators={operators.map((operator) => ({
                id: operator.id,
                label: operator.name
                  ? `${operator.name} · ${operator.email}`
                  : operator.email,
              }))}
              values={{
                name: "",
                description: "",
                internalNotes: "",
                messageText: "",
                ctaLabel: "",
                ctaUrl: "",
                targetListId: "",
                deviceModePolicy: "SINGLE_DEVICE",
                allowedSpeeds: [3, 6],
                payoutPerSend: defaultPayout,
                currency: defaultCurrency,
                quotaPerUser: 500,
                maxConcurrentJobs: 1,
                assignmentPolicy: "ALL_ELIGIBLE",
                assignedUserIds: [],
                allowUserPause: true,
                requireTermsAccept: true,
                retryLimit: 2,
                scheduledStartAt: utcLocal(1),
                scheduledEndAt: utcLocal(24 * 7),
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
