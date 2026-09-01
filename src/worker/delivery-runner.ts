import "server-only";

import { prisma } from "@/lib/db/prisma";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/observability/logger";
import { whatsappAdapter } from "@/lib/whatsapp/adapter";
import { retryBackoffMs } from "@/lib/whatsapp/errors";
import {
  claimRecipients,
  heartbeatLease,
  markSending,
  releaseClaims,
} from "@/lib/delivery/recipient-claim";
import {
  recordAmbiguous,
  recordFailure,
  recordSent,
} from "@/lib/delivery/record-result";
import { finaliseIfComplete } from "@/lib/blast/lifecycle";
import { RECIPIENT_HEARTBEAT_MS } from "@/lib/constants";

/**
 * Delivery loop (RULES.md §12, §13).
 *
 * Runs only inside the worker process. Recipients are claimed in small batches,
 * sent one at a time at the job's configured speed, and every result is written
 * with a conditional update. No database transaction is ever held open across a
 * WhatsApp network call.
 */

const CLAIM_BATCH_SIZE = 20;

/** Job/campaign/user/device preconditions, re-read before every single send. */
type SendGate =
  | { ok: true; payload: SendContext }
  | { ok: false; reason: string; terminal: boolean };

type SendContext = {
  userId: string;
  deviceId: string;
  speedSeconds: number;
  retryLimit: number;
  payoutPerSend: string;
  currency: string;
  messageText: string;
  media?: { storagePath: string; mimeType: string; caption?: string };
};

async function evaluateGate(blastJobId: string): Promise<SendGate> {
  const job = await prisma.blastJob.findUnique({
    where: { id: blastJobId },
    select: {
      status: true,
      speedSeconds: true,
      snapshotRetryLimit: true,
      snapshotPayoutPerSend: true,
      snapshotCurrency: true,
      snapshotMessageText: true,
      snapshotMediaKey: true,
      snapshotMediaMime: true,
      snapshotMediaCaption: true,
      user: { select: { id: true, status: true, deletedAt: true } },
      device: { select: { id: true, status: true, deletedAt: true } },
      campaign: {
        select: { status: true, scheduledEndAt: true },
      },
    },
  });

  if (!job) {
    return { ok: false, reason: "JOB_MISSING", terminal: true };
  }
  if (job.status === "PAUSED") {
    return { ok: false, reason: "JOB_PAUSED", terminal: false };
  }
  if (job.status !== "RUNNING" && job.status !== "QUEUED") {
    return { ok: false, reason: `JOB_${job.status}`, terminal: true };
  }
  if (job.user.status !== "ACTIVE" || job.user.deletedAt) {
    return { ok: false, reason: "USER_INACTIVE", terminal: true };
  }
  if (job.campaign.status !== "ACTIVE") {
    return { ok: false, reason: "CAMPAIGN_INACTIVE", terminal: true };
  }
  if (job.campaign.scheduledEndAt < new Date()) {
    return { ok: false, reason: "CAMPAIGN_WINDOW_CLOSED", terminal: true };
  }
  if (job.device.deletedAt) {
    return { ok: false, reason: "DEVICE_REMOVED", terminal: true };
  }
  if (job.device.status !== "CONNECTED") {
    return { ok: false, reason: "DEVICE_DISCONNECTED", terminal: false };
  }

  return {
    ok: true,
    payload: {
      userId: job.user.id,
      deviceId: job.device.id,
      speedSeconds: job.speedSeconds,
      retryLimit: job.snapshotRetryLimit,
      payoutPerSend: job.snapshotPayoutPerSend.toString(),
      currency: job.snapshotCurrency,
      messageText: job.snapshotMessageText,
      ...(job.snapshotMediaKey && job.snapshotMediaMime
        ? {
            media: {
              storagePath: job.snapshotMediaKey,
              mimeType: job.snapshotMediaMime,
              ...(job.snapshotMediaCaption
                ? { caption: job.snapshotMediaCaption }
                : {}),
            },
          }
        : {}),
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Processes one blast job until it is drained, paused, or blocked.
 *
 * Returns the number of recipients that reached a terminal state in this pass.
 */
export async function runBlastJob(blastJobId: string): Promise<number> {
  const log = logger("worker");
  const workerId = serverEnv().WORKER_ID ?? "worker-unknown";

  // Claim the RUNNING transition; a second worker picking up the same job id
  // will see the status already advanced and simply continue the same loop.
  await prisma.blastJob.updateMany({
    where: { id: blastJobId, status: "QUEUED" },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  let processed = 0;

  for (;;) {
    const gate = await evaluateGate(blastJobId);

    if (!gate.ok) {
      log.info(
        { event: "delivery.halted", blastJobId, reason: gate.reason },
        "Delivery loop halted",
      );
      await releaseClaims({ blastJobId, workerId });
      if (gate.terminal) {
        await finaliseIfComplete(blastJobId);
      }
      return processed;
    }

    const context = gate.payload;

    const batch = await claimRecipients({
      campaignId: (
        await prisma.blastJob.findUniqueOrThrow({
          where: { id: blastJobId },
          select: { campaignId: true },
        })
      ).campaignId,
      blastJobId,
      workerId,
      limit: CLAIM_BATCH_SIZE,
    });

    if (batch.length === 0) {
      await finaliseIfComplete(blastJobId);
      return processed;
    }

    for (const recipient of batch) {
      // Re-check the gate before each individual send (RULES.md §12).
      const perSendGate = await evaluateGate(blastJobId);
      if (!perSendGate.ok) {
        await releaseClaims({ blastJobId, workerId });
        if (perSendGate.terminal) {
          await finaliseIfComplete(blastJobId);
        }
        return processed;
      }

      const owned = await markSending({
        recipientId: recipient.id,
        workerId,
      });

      if (!owned) {
        // The lease was lost between claim and send; skip without sending.
        continue;
      }

      const heartbeat = setInterval(() => {
        void heartbeatLease({ recipientId: recipient.id, workerId });
      }, RECIPIENT_HEARTBEAT_MS);

      try {
        const result = await whatsappAdapter.send(context.deviceId, {
          normalizedNumber: recipient.normalizedNumber,
          text: context.messageText,
          ...(context.media ? { media: context.media } : {}),
        });

        if (result.status === "SENT") {
          await recordSent({
            recipientId: recipient.id,
            blastJobId,
            userId: context.userId,
            workerId,
            ...(result.providerMessageId
              ? { providerMessageId: result.providerMessageId }
              : {}),
            payoutPerSend: context.payoutPerSend,
            currency: context.currency,
            idempotencyKey: recipient.idempotencyKey,
          });
        } else if (result.status === "UNKNOWN") {
          await recordAmbiguous({
            recipientId: recipient.id,
            blastJobId,
            workerId,
            reason: result.failureCategory ?? "AMBIGUOUS",
            detail: result.failureReason,
          });
        } else {
          await recordFailure({
            recipientId: recipient.id,
            workerId,
            category: result.failureCategory ?? "UNKNOWN",
            reason: result.failureReason ?? "Send failed",
            retryable: result.status === "RETRYABLE_FAILED",
            retryLimit: context.retryLimit,
            backoffMs: retryBackoffMs(recipient.attemptCount + 1),
          });
        }

        await prisma.deliveryLog.create({
          data: {
            blastJobId,
            recipientId: recipient.id,
            recipientRef: recipient.recipientRef,
            event: "SEND_ATTEMPT",
            status: result.status,
            detail: result.failureCategory ?? null,
            workerId,
          },
        });

        processed += 1;
      } catch (error) {
        // An exception here means the outcome could not be determined at all.
        await recordAmbiguous({
          recipientId: recipient.id,
          blastJobId,
          workerId,
          reason: "WORKER_EXCEPTION",
          detail: error instanceof Error ? error.name : "unknown",
        });
      } finally {
        clearInterval(heartbeat);
      }

      // Server-enforced pacing between sends.
      await sleep(context.speedSeconds * 1_000);
    }
  }
}
