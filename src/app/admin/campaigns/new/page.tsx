import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ListChecks, Plus, TriangleAlert } from "lucide-react";

import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getSetting } from "@/lib/settings/service";
import { SETTING_KEYS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  PageHeader,
  PageSections,
  SectionCard,
} from "@/components/ui/page";
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
        icon={<Plus className="size-5" />}
        title="New campaign"
        description="Campaigns are created as drafts. Activate one when it is ready to run."
      />

      <PageSections>
        <SectionCard
          title="Campaign details"
          description="Only administrators can create or change a campaign. Operators can only start jobs against it."
          icon={<ListChecks className="size-5" />}
          tone="info"
        >
          {lists.length === 0 ? (
            <EmptyState
              icon={<TriangleAlert className="size-6" />}
              tone="warning"
              title="No imported target list"
              description="Upload and import a target list before creating a campaign."
              action={
                <Button asChild>
                  <Link href="/admin/target-lists">
                    <ListChecks aria-hidden="true" />
                    Go to target lists
                  </Link>
                </Button>
              }
            />
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
                mediaKey: "",
                mediaMime: "",
                mediaCaption: "",
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
        </SectionCard>
      </PageSections>
    </>
  );
}
