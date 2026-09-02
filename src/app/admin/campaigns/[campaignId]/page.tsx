import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Megaphone, PencilLine, Workflow } from "lucide-react";

import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, PageSections, SectionCard } from "@/components/ui/page";
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
    <>
      <div className="mb-5">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/campaigns">
            <ArrowLeft aria-hidden="true" />
            All campaigns
          </Link>
        </Button>
      </div>

      <PageHeader
        icon={<Megaphone className="size-5" />}
        tone={campaign.status === "ACTIVE" ? "success" : "info"}
        title={campaign.name}
        description={`Content version ${campaign.contentVersion} · ${
          campaign._count.recipients
        } recipient${
          campaign._count.recipients === 1 ? "" : "s"
        } allocated. Recipient numbers are never rendered.`}
        actions={
          <Badge variant={campaign.status === "ACTIVE" ? "success" : "neutral"}>
            {campaign.status}
          </Badge>
        }
      />

      <PageSections>
        <SectionCard
          title="Lifecycle"
          description="Running jobs keep the policy snapshot they started with."
          icon={<Workflow className="size-5" />}
          tone={campaign.status === "ACTIVE" ? "success" : "primary"}
        >
          <CampaignTransitionControls
            campaignId={campaign.id}
            status={campaign.status}
          />
        </SectionCard>

        <SectionCard
          title="Campaign details"
          description="Editing the message increments the content version; in-flight jobs are unaffected."
          icon={<PencilLine className="size-5" />}
          tone="info"
        >
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
        </SectionCard>
      </PageSections>
    </>
  );
}
