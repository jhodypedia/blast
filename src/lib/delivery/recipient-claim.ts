import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { PrismaTransactionClient } from "@/lib/db/prisma";
import { prisma } from "@/lib/db/prisma";
import { rowLockClause } from "@/lib/db/locking";
import { RECIPIENT_LEASE_MS } from "@/lib/constants";

/**
 * Atomic recipient claiming (RULES.md §12).
 *
 * Claiming uses a locking `SELECT` inside a short transaction so concurrent
 * workers never hand the same recipient to two devices. `FOR UPDATE SKIP LOCKED`
 * is used where the server supports it (MySQL >= 8.0, MariaDB >= 10.6); older
 * servers fall back to a blocking `FOR UPDATE`, and the conditional status
 * transition keeps exclusivity either way. The transaction closes before any
 * WhatsApp call is made — a network call must never be awaited while holding row
 * locks.
 */

export type ClaimedRecipient = {
  id: bigint;
  normalizedNumber: string;
  recipientRef: string;
  idempotencyKey: string;
  attemptCount: number;
};

/**
 * Claims up to `limit` eligible recipients for a blast job.
 *
 * Eligible rows are `PENDING`, or `RETRYABLE_FAILED` whose backoff has elapsed.
 * Each claimed row is stamped with the worker id and a fresh lease.
 */
export async function claimRecipients(params: {
  campaignId: string;
  blastJobId: string;
  workerId: string;
  limit: number;
  leaseMs?: number;
}): Promise<ClaimedRecipient[]> {
  const leaseMs = params.leaseMs ?? RECIPIENT_LEASE_MS;

  // Probed outside the transaction and cached per process; the probe opens its
  // own transaction so it must not run nested inside this one.
  const lockClause = await rowLockClause(prisma);

  return prisma.$transaction(
    async (tx) => {
      const now = new Date();

      // The locking read keeps parallel workers off the same rows. Where the
      // server supports it this is `SKIP LOCKED`, so batches are disjoint;
      // otherwise it blocks, and the conditional transitions below remain the
      // guarantee that a recipient is only ever handed to one worker.
      const rows = await tx.$queryRaw<
        Array<{
          id: bigint;
          normalizedNumber: string;
          recipientRef: string;
          idempotencyKey: string;
          attemptCount: number;
        }>
      >(Prisma.sql`
        SELECT id, normalizedNumber, recipientRef, idempotencyKey, attemptCount
        FROM CampaignRecipient
        WHERE campaignId = ${params.campaignId}
          AND (blastJobId IS NULL OR blastJobId = ${params.blastJobId})
          AND (
            status = 'PENDING'
            OR (status = 'RETRYABLE_FAILED' AND (nextAttemptAt IS NULL OR nextAttemptAt <= ${now}))
          )
        ORDER BY id ASC
        LIMIT ${params.limit}
        ${lockClause}
      `);

      if (rows.length === 0) {
        return [];
      }

      const ids = rows.map((row) => row.id);
      const leaseExpiresAt = new Date(now.getTime() + leaseMs);

      // Conditional on the rows still being eligible: without SKIP LOCKED a
      // blocked reader can wake up on rows another worker has already taken.
      const claimed = await tx.campaignRecipient.updateMany({
        where: {
          id: { in: ids },
          status: { in: ["PENDING", "RETRYABLE_FAILED"] },
        },
        data: {
          status: "CLAIMED",
          blastJobId: params.blastJobId,
          workerId: params.workerId,
          lockedAt: now,
          leaseExpiresAt,
        },
      });

      if (claimed.count === rows.length) {
        return rows;
      }

      // Some rows were lost to a competing worker; return only what this worker
      // actually owns so the caller never sends on someone else's recipient.
      // Rows this worker claimed on an earlier pass cannot appear here: they are
      // no longer PENDING/RETRYABLE_FAILED, so the select above skipped them.
      const owned = await tx.campaignRecipient.findMany({
        where: {
          id: { in: ids },
          status: "CLAIMED",
          blastJobId: params.blastJobId,
          workerId: params.workerId,
        },
        select: {
          id: true,
          normalizedNumber: true,
          recipientRef: true,
          idempotencyKey: true,
          attemptCount: true,
        },
        orderBy: { id: "asc" },
      });

      return owned;
    },
    { timeout: 10_000, isolationLevel: "ReadCommitted" },
  );
}

/**
 * Marks a claimed recipient as `SENDING` immediately before the provider call.
 * Returns false when the lease was lost, in which case the caller must abort
 * without sending.
 */
export async function markSending(params: {
  recipientId: bigint;
  workerId: string;
  leaseMs?: number;
}): Promise<boolean> {
  const now = new Date();
  const leaseExpiresAt = new Date(
    now.getTime() + (params.leaseMs ?? RECIPIENT_LEASE_MS),
  );

  const result = await prisma.campaignRecipient.updateMany({
    where: {
      id: params.recipientId,
      workerId: params.workerId,
      status: "CLAIMED",
      leaseExpiresAt: { gt: now },
    },
    data: {
      status: "SENDING",
      lastAttemptAt: now,
      leaseExpiresAt,
      attemptCount: { increment: 1 },
    },
  });

  return result.count === 1;
}

/** Extends the lease of an in-flight recipient during a long provider call. */
export async function heartbeatLease(params: {
  recipientId: bigint;
  workerId: string;
  leaseMs?: number;
}): Promise<boolean> {
  const leaseExpiresAt = new Date(
    Date.now() + (params.leaseMs ?? RECIPIENT_LEASE_MS),
  );

  const result = await prisma.campaignRecipient.updateMany({
    where: {
      id: params.recipientId,
      workerId: params.workerId,
      status: { in: ["CLAIMED", "SENDING"] },
    },
    data: { leaseExpiresAt },
  });

  return result.count === 1;
}

/**
 * Returns claimed-but-unsent recipients to `PENDING` when a job stops cleanly.
 * Rows in `SENDING` are never released here: their outcome is unknown and is
 * handled by the reconciliation sweep instead.
 */
export async function releaseClaims(params: {
  blastJobId: string;
  workerId?: string;
  tx?: PrismaTransactionClient;
}): Promise<number> {
  const client = params.tx ?? prisma;

  const result = await client.campaignRecipient.updateMany({
    where: {
      blastJobId: params.blastJobId,
      status: "CLAIMED",
      ...(params.workerId ? { workerId: params.workerId } : {}),
    },
    data: {
      status: "PENDING",
      workerId: null,
      lockedAt: null,
      leaseExpiresAt: null,
    },
  });

  return result.count;
}

/**
 * Reclaims rows whose lease expired while `CLAIMED`. These were never handed to
 * the provider, so returning them to `PENDING` is safe.
 */
export async function reclaimExpiredClaims(limit = 500): Promise<number> {
  const now = new Date();

  const stale = await prisma.campaignRecipient.findMany({
    where: {
      status: "CLAIMED",
      leaseExpiresAt: { lt: now },
    },
    select: { id: true },
    take: limit,
  });

  if (stale.length === 0) {
    return 0;
  }

  const result = await prisma.campaignRecipient.updateMany({
    where: {
      id: { in: stale.map((row) => row.id) },
      status: "CLAIMED",
      leaseExpiresAt: { lt: now },
    },
    data: {
      status: "PENDING",
      workerId: null,
      lockedAt: null,
      leaseExpiresAt: null,
    },
  });

  return result.count;
}
