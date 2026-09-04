/**
 * Fixture builders for integration tests.
 *
 * Every builder creates the minimum row graph the delivery pipeline needs and
 * returns real ids, so tests exercise the same constraints and indexes as
 * production. Cleanup is by id prefix, never a blanket `TRUNCATE`, so a
 * mistakenly-pointed database loses only rows this file created.
 */
import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db/prisma";

/** Shared prefix so cleanup can find everything this run created. */
export const FIXTURE_PREFIX = "itest";

export type DeliveryFixture = {
  runId: string;
  adminId: string;
  userId: string;
  deviceId: string;
  targetListId: string;
  campaignId: string;
  blastJobId: string;
  recipientIds: bigint[];
  payoutPerSend: string;
  currency: string;
};

function id(runId: string, kind: string): string {
  return `${FIXTURE_PREFIX}-${kind}-${runId}`;
}

/**
 * Creates admin + user + device + target list + ACTIVE campaign + RUNNING blast
 * job + `recipientCount` PENDING recipients.
 */
export async function createDeliveryFixture(options?: {
  recipientCount?: number;
  payoutPerSend?: string;
  retryLimit?: number;
}): Promise<DeliveryFixture> {
  const recipientCount = options?.recipientCount ?? 40;
  const payoutPerSend = options?.payoutPerSend ?? "125.0000";
  const retryLimit = options?.retryLimit ?? 2;
  const currency = "IDR";
  const runId = randomUUID().slice(0, 8);

  const adminId = id(runId, "admin");
  const userId = id(runId, "user");
  const deviceId = id(runId, "device");
  const targetListId = id(runId, "list");
  const campaignId = id(runId, "campaign");
  const blastJobId = id(runId, "job");

  await prisma.user.createMany({
    data: [
      {
        id: adminId,
        email: `${adminId}@example.test`,
        // Not a usable credential: these fixtures never authenticate.
        passwordHash: "integration-test-not-a-hash",
        name: "Integration Admin",
        role: "ADMIN",
      },
      {
        id: userId,
        email: `${userId}@example.test`,
        passwordHash: "integration-test-not-a-hash",
        name: "Integration User",
        role: "USER",
      },
    ],
  });

  const digits = runId.replace(/\D/g, "").padEnd(8, "0").slice(0, 8);
  const now = new Date();

  await prisma.device.create({
    data: {
      id: deviceId,
      userId,
      publicId: `device-${userId}-${randomUUID()}`,
      label: "Integration Device",
      status: "CONNECTED",
      phoneNumber: `62899${digits.slice(0, 7)}`,
      lastConnectedAt: now,
      lastSeenAt: now,
    },
  });

  await prisma.targetList.create({
    data: {
      id: targetListId,
      name: `Integration list ${runId}`,
      status: "READY",
      uploadedByAdminId: adminId,
      originalFileName: "integration.txt",
      defaultCountryCode: "ID",
      sourceRowCount: recipientCount,
      validCount: recipientCount,
      importedCount: recipientCount,
    },
  });

  await prisma.campaign.create({
    data: {
      id: campaignId,
      name: `Integration campaign ${runId}`,
      description: "Integration test campaign",
      createdByAdminId: adminId,
      status: "ACTIVE",
      messageText: "Integration test message",
      targetListId,
      allowedSpeeds: [1, 3, 6, 10],
      payoutPerSend,
      currency,
      quotaPerUser: recipientCount,
      retryLimit,
      scheduledStartAt: new Date(now.getTime() - 60_000),
      scheduledEndAt: new Date(now.getTime() + 86_400_000),
      activatedAt: now,
    },
  });

  await prisma.blastJob.create({
    data: {
      id: blastJobId,
      campaignId,
      userId,
      deviceId,
      status: "RUNNING",
      submissionKey: `${FIXTURE_PREFIX}-${runId}`,
      snapshotContentVersion: 1,
      snapshotMessageText: "Integration test message",
      snapshotPayoutPerSend: payoutPerSend,
      snapshotCurrency: currency,
      snapshotDeviceMode: "SINGLE_DEVICE",
      snapshotRetryLimit: retryLimit,
      snapshotAllowUserPause: true,
      speedSeconds: 1,
      quotaTotal: recipientCount,
      startedAt: now,
    },
  });

  await prisma.campaignRecipient.createMany({
    data: Array.from({ length: recipientCount }, (_, index) => ({
      campaignId,
      normalizedNumber: `6288${digits}${String(index).padStart(4, "0")}`,
      recipientRef: `ref-${runId}-${index}`,
      idempotencyKey: `${FIXTURE_PREFIX}:${runId}:${index}`,
      status: "PENDING" as const,
    })),
  });

  const recipients = await prisma.campaignRecipient.findMany({
    where: { campaignId },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  return {
    runId,
    adminId,
    userId,
    deviceId,
    targetListId,
    campaignId,
    blastJobId,
    recipientIds: recipients.map((row) => row.id),
    payoutPerSend,
    currency,
  };
}

/**
 * Removes every row a fixture created, in foreign-key-safe order.
 *
 * Ledger rows are deleted here despite being append-only in production: these
 * are synthetic rows in a throwaway database, not real financial history.
 */
export async function cleanupDeliveryFixture(
  fixture: DeliveryFixture,
): Promise<void> {
  await prisma.reconciliationEvent.deleteMany({
    where: { blastJobId: fixture.blastJobId },
  });
  await prisma.deliveryLog.deleteMany({
    where: { blastJobId: fixture.blastJobId },
  });
  await prisma.ledgerEntry.deleteMany({ where: { userId: fixture.userId } });
  await prisma.campaignRecipient.deleteMany({
    where: { campaignId: fixture.campaignId },
  });
  await prisma.blastJob.deleteMany({ where: { id: fixture.blastJobId } });
  await prisma.campaignAssignment.deleteMany({
    where: { campaignId: fixture.campaignId },
  });
  await prisma.campaign.deleteMany({ where: { id: fixture.campaignId } });
  await prisma.targetNumber.deleteMany({
    where: { targetListId: fixture.targetListId },
  });
  await prisma.targetList.deleteMany({ where: { id: fixture.targetListId } });
  await prisma.deviceAuthState.deleteMany({
    where: { deviceId: fixture.deviceId },
  });
  await prisma.device.deleteMany({ where: { id: fixture.deviceId } });
  await prisma.user.deleteMany({
    where: { id: { in: [fixture.adminId, fixture.userId] } },
  });
}

