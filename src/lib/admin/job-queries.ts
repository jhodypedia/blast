import "server-only";

import { prisma } from "@/lib/db/prisma";
import { blastJobProgress, completionPercent } from "@/lib/delivery/progress";

/**
 * Admin blast-job monitoring.
 *
 * Recipient identities are represented only by their non-reversible reference,
 * so the operational view cannot leak a phone number (RULES.md §10, §16).
 */

export type AdminJobRow = {
  id: string;
  status: string;
  campaignName: string;
  operatorEmail: string;
  deviceLabel: string;
  speedSeconds: number;
  quotaTotal: number;
  sent: number;
  failed: number;
  needsReconciliation: number;
  percent: number;
  createdAt: Date;
  finishedAt: Date | null;
};

export async function listJobsForAdmin(params?: {
  onlyLive?: boolean;
  limit?: number;
}): Promise<AdminJobRow[]> {
  const jobs = await prisma.blastJob.findMany({
    where: params?.onlyLive
      ? { status: { in: ["PENDING", "QUEUED", "RUNNING", "PAUSED"] } }
      : {},
    orderBy: { createdAt: "desc" },
    take: Math.min(params?.limit ?? 50, 200),
    select: {
      id: true,
      status: true,
      speedSeconds: true,
      quotaTotal: true,
      createdAt: true,
      finishedAt: true,
      campaign: { select: { name: true } },
      user: { select: { email: true } },
      device: { select: { label: true } },
    },
  });

  return Promise.all(
    jobs.map(async (job) => {
      const progress = await blastJobProgress(job.id);

      return {
        id: job.id,
        status: job.status,
        campaignName: job.campaign.name,
        operatorEmail: job.user.email,
        deviceLabel: job.device.label,
        speedSeconds: job.speedSeconds,
        quotaTotal: job.quotaTotal,
        sent: progress.sent,
        failed: progress.failed,
        needsReconciliation: progress.needsReconciliation,
        percent: completionPercent(progress),
        createdAt: job.createdAt,
        finishedAt: job.finishedAt,
      };
    }),
  );
}
