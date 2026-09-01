import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CampaignForm } from "@/components/admin/campaign-form";
import { CampaignTransitionControls } from "@/components/admin/campaign-transition-controls";

export const metadata: Metadata = { title: "Edit campaign" };

/** `datetime-local` expects `YYYY-MM-DDTHH:mm` with no timezone suffix. */
function toLocalInput(value: Date): string {
  return value.toISOString().slice(0, 16);
}

export default async function EditCampaignPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  await requireAdmin();
  const { campaignId } = await params;

  const [campaign, lists, operators] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        name: true,
        description: true,
        internalNotes: true,
        messageText: true,
        ctaLabel: true,
        ctaUrl: true,
        targetListId: true,
        deviceModePolicy: true,
        allowedSpeeds: true,
        payoutPerSend: true,
        currency: true,
        quotaPerUser: true,
        maxConcurrentJobs: true,
        assignmentPolicy: true,
        allowUserPause: true,
        requireTermsAccept: true,
        retryLimit: true,
        scheduledStartAt: true,
        scheduledEndAt: true,
        status: true,
        contentVersion: true,
        assignments: { select: { userId: true } },
        _count: { select: { recipients: true } },
      },
    }),
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
  ]);

  if (!campaign) {
    notFound();
  }

  const lockEconomics = campaign._count.recipients > 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {campaign.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Content version {campaign.contentVersion} ·{" "}
            {campaign._count.recipients} recipient
            {campaign._count.recipients === 1 ? "" : "s"} allocated
          </p>
        </div>
        <Badge variant={campaign.status === "ACTIVE" ? "success" : "neutral"}>
          {campaign.status}
        </Badge>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Lifecycle</CardTitle>
          <CardDescription>
            Running jobs keep the policy snapshot they started with.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CampaignTransitionControls
            campaignId={campaign.id}
            status={campaign.status}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Campaign details</CardTitle>
          <CardDescription>
            Editing the message increments the content version; in-flight jobs are
            unaffected.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CampaignForm
            lockEconomics={lockEconomics}
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
              id: campaign.id,
              name: campaign.name,
              description: campaign.description,
              internalNotes: campaign.internalNotes ?? "",
              messageText: campaign.messageText,
              ctaLabel: campaign.ctaLabel ?? "",
              ctaUrl: campaign.ctaUrl ?? "",
              targetListId: campaign.targetListId,
              deviceModePolicy: campaign.deviceModePolicy,
              allowedSpeeds: Array.isArray(campaign.allowedSpeeds)
                ? (campaign.allowedSpeeds as number[])
                : [],
              payoutPerSend: campaign.payoutPerSend.toString(),
              currency: campaign.currency,
              quotaPerUser: campaign.quotaPerUser,
              maxConcurrentJobs: campaign.maxConcurrentJobs,
              assignmentPolicy: campaign.assignmentPolicy,
              assignedUserIds: campaign.assignments.map((row) => row.userId),
              allowUserPause: campaign.allowUserPause,
              requireTermsAccept: campaign.requireTermsAccept,
              retryLimit: campaign.retryLimit,
              scheduledStartAt: toLocalInput(campaign.scheduledStartAt),
              scheduledEndAt: toLocalInput(campaign.scheduledEndAt),
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
