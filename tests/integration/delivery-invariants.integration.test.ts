import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import {
  claimRecipients,
  type ClaimedRecipient,
  heartbeatLease,
  markSending,
  reclaimExpiredClaims,
  releaseClaims,
} from "@/lib/delivery/recipient-claim";
import {
  recordAmbiguous,
  recordFailure,
  recordSent,
} from "@/lib/delivery/record-result";

import {
  detectCapabilities,
  skipLockedRequirementMessage,
} from "./db-capabilities";
import {
  cleanupDeliveryFixture,
  createDeliveryFixture,
  type DeliveryFixture,
} from "./fixtures";

/**
 * Delivery invariant integration tests (RULES.md §12, §14).
 *
 * These run against a real MySQL database because the guarantees under test —
 * `FOR UPDATE SKIP LOCKED` claiming, conditional state transitions and the
 * unique ledger idempotency key — live in the database, not in TypeScript. A
 * mocked client would pass while production double-sent and double-paid.
 *
 * Requires MySQL >= 8.0 or MariaDB >= 10.6. Run with: npm run test:integration
 */

const fixtures: DeliveryFixture[] = [];

async function newFixture(
  options?: Parameters<typeof createDeliveryFixture>[0],
): Promise<DeliveryFixture> {
  const fixture = await createDeliveryFixture(options);
  fixtures.push(fixture);
  return fixture;
}

/**
 * Claims recipients and asserts the batch is exactly `expected` long.
 *
 * `noUncheckedIndexedAccess` makes indexing an array yield `T | undefined`, and
 * an unexpectedly short batch should fail here with a clear message rather than
 * at the first property access further down the test.
 */
async function claimExactly(
  fixture: DeliveryFixture,
  workerId: string,
  expected: number,
  leaseMs?: number,
): Promise<ClaimedRecipient[]> {
  const claimed = await claimRecipients({
    campaignId: fixture.campaignId,
    blastJobId: fixture.blastJobId,
    workerId,
    limit: expected,
    ...(leaseMs === undefined ? {} : { leaseMs }),
  });
  expect(claimed).toHaveLength(expected);
  return claimed;
}

/** Claims a single recipient, narrowing away `undefined`. */
async function claimOne(
  fixture: DeliveryFixture,
  workerId: string,
  leaseMs?: number,
): Promise<ClaimedRecipient> {
  const [claimed] = await claimExactly(fixture, workerId, 1, leaseMs);
  if (!claimed) {
    throw new Error("claimRecipients returned an empty batch");
  }
  return claimed;
}

/** Reads back the fields the delivery invariants are asserted against. */
async function readRecipient(recipientId: bigint) {
  return prisma.campaignRecipient.findUniqueOrThrow({
    where: { id: recipientId },
    select: {
      status: true,
      workerId: true,
      attemptCount: true,
      nextAttemptAt: true,
      leaseExpiresAt: true,
      lockedAt: true,
      blastJobId: true,
    },
  });
}

beforeAll(async () => {
  // Deliberately a hard failure, not a skip. The application degrades to a
  // blocking `FOR UPDATE` on an older server, but these tests are the only
  // execution-level proof that concurrent workers get disjoint batches. Skipping
  // would report a green run while that guarantee went unverified.
  const capabilities = await detectCapabilities();
  if (!capabilities.supportsSkipLocked) {
    throw new Error(skipLockedRequirementMessage(capabilities.version));
  }
});


afterEach(async () => {
  while (fixtures.length > 0) {
    const fixture = fixtures.pop();
    if (fixture) {
      await cleanupDeliveryFixture(fixture);
    }
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("concurrent claiming", () => {
  it("never hands the same recipient to two workers", async () => {
    const fixture = await newFixture({ recipientCount: 60 });

    // Six workers race for overlapping batches; the batches sum to more than
    // the available rows so at least one worker must come back short.
    const workers = ["w1", "w2", "w3", "w4", "w5", "w6"];
    const batches = await Promise.all(
      workers.map((workerId) =>
        claimRecipients({
          campaignId: fixture.campaignId,
          blastJobId: fixture.blastJobId,
          workerId,
          limit: 15,
        }),
      ),
    );

    const claimedIds = batches.flat().map((row) => row.id.toString());
    const uniqueIds = new Set(claimedIds);

    expect(claimedIds.length).toBe(uniqueIds.size);
    expect(claimedIds.length).toBeLessThanOrEqual(60);

    // Every claimed row carries exactly one owner and a live lease.
    const rows = await prisma.campaignRecipient.findMany({
      where: { campaignId: fixture.campaignId, status: "CLAIMED" },
      select: { id: true, workerId: true, leaseExpiresAt: true, blastJobId: true },
    });

    expect(rows.length).toBe(uniqueIds.size);
    for (const row of rows) {
      expect(row.workerId).toBeTruthy();
      expect(row.blastJobId).toBe(fixture.blastJobId);
      expect(row.leaseExpiresAt!.getTime()).toBeGreaterThan(Date.now() - 1_000);
    }
  });

  it("claims each row at most once across sequential passes", async () => {
    const fixture = await newFixture({ recipientCount: 10 });

    const first = await claimRecipients({
      campaignId: fixture.campaignId,
      blastJobId: fixture.blastJobId,
      workerId: "w1",
      limit: 10,
    });
    const second = await claimRecipients({
      campaignId: fixture.campaignId,
      blastJobId: fixture.blastJobId,
      workerId: "w2",
      limit: 10,
    });

    expect(first).toHaveLength(10);
    // Already CLAIMED rows are no longer eligible, so the second pass is empty.
    expect(second).toHaveLength(0);
  });

  it("only lets one worker move a recipient to SENDING", async () => {
    const fixture = await newFixture({ recipientCount: 1 });
    const claimed = await claimOne(fixture, "w1");

    const results = await Promise.all([
      markSending({ recipientId: claimed.id, workerId: "w1" }),
      markSending({ recipientId: claimed.id, workerId: "w1" }),
      markSending({ recipientId: claimed.id, workerId: "impostor" }),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);

    const row = await readRecipient(claimed.id);
    expect(row.status).toBe("SENDING");
    expect(row.workerId).toBe("w1");
    // Exactly one attempt was counted, so retry budgets stay accurate.
    expect(row.attemptCount).toBe(1);
  });
});

describe("lease expiry and crash recovery", () => {
  it("reclaims a CLAIMED row whose lease expired", async () => {
    const fixture = await newFixture({ recipientCount: 3 });

    // A negative lease simulates a worker that died right after claiming,
    // without making the test sleep.
    await claimExactly(fixture, "dead-worker", 3, -1_000);

    const reclaimed = await reclaimExpiredClaims();
    expect(reclaimed).toBeGreaterThanOrEqual(3);

    const rows = await prisma.campaignRecipient.findMany({
      where: { campaignId: fixture.campaignId },
      select: {
        status: true,
        workerId: true,
        leaseExpiresAt: true,
        lockedAt: true,
      },
    });
    for (const row of rows) {
      expect(row.status).toBe("PENDING");
      expect(row.workerId).toBeNull();
      expect(row.leaseExpiresAt).toBeNull();
      expect(row.lockedAt).toBeNull();
    }

    // A healthy worker can now pick the same rows up again.
    await claimExactly(fixture, "live-worker", 3);
  });

  it("never reclaims a SENDING row, because its outcome is unknown", async () => {
    const fixture = await newFixture({ recipientCount: 1 });
    const claimed = await claimOne(fixture, "w1");
    expect(
      await markSending({
        recipientId: claimed.id,
        workerId: "w1",
        leaseMs: -1_000,
      }),
    ).toBe(true);

    await reclaimExpiredClaims();
    await releaseClaims({ blastJobId: fixture.blastJobId });

    const row = await readRecipient(claimed.id);
    // Still SENDING: resending here could deliver the message twice.
    expect(row.status).toBe("SENDING");
    expect(row.workerId).toBe("w1");
  });

  it("rejects a heartbeat from a worker that does not own the row", async () => {
    const fixture = await newFixture({ recipientCount: 1 });
    const claimed = await claimOne(fixture, "w1");

    expect(
      await heartbeatLease({ recipientId: claimed.id, workerId: "w1" }),
    ).toBe(true);
    expect(
      await heartbeatLease({ recipientId: claimed.id, workerId: "w2" }),
    ).toBe(false);
  });

  it("returns CLAIMED rows to PENDING on a clean stop", async () => {
    const fixture = await newFixture({ recipientCount: 5 });
    await claimRecipients({
      campaignId: fixture.campaignId,
      blastJobId: fixture.blastJobId,
      workerId: "w1",
      limit: 5,
    });

    const released = await releaseClaims({
      blastJobId: fixture.blastJobId,
      workerId: "w1",
    });
    expect(released).toBe(5);

    const pending = await prisma.campaignRecipient.count({
      where: { campaignId: fixture.campaignId, status: "PENDING" },
    });
    expect(pending).toBe(5);
  });
});

describe("earnings idempotency", () => {
  /** Drives one recipient through claim -> SENDING and returns it. */
  async function takeOne(fixture: DeliveryFixture, workerId: string) {
    const claimed = await claimOne(fixture, workerId);
    const ok = await markSending({ recipientId: claimed.id, workerId });
    expect(ok).toBe(true);
    return claimed;
  }

  it("credits exactly one earning per SENT recipient, even on replay", async () => {
    const fixture = await newFixture({
      recipientCount: 1,
      payoutPerSend: "250.0000",
    });
    const claimed = await takeOne(fixture, "w1");

    const params = {
      recipientId: claimed.id,
      blastJobId: fixture.blastJobId,
      userId: fixture.userId,
      workerId: "w1",
      providerMessageId: "provider-msg-1",
      payoutPerSend: fixture.payoutPerSend,
      currency: fixture.currency,
      idempotencyKey: claimed.idempotencyKey,
    };

    const first = await recordSent(params);
    // A duplicate BullMQ delivery of the same job replays the identical call.
    const second = await recordSent(params);

    expect(first.outcome).toBe("RECORDED");
    expect(second.outcome).toBe("ALREADY_RECORDED");

    const entries = await prisma.ledgerEntry.findMany({
      where: { userId: fixture.userId, type: "EARNING" },
      select: {
        amount: true,
        idempotencyKey: true,
        status: true,
        sourceId: true,
      },
    });

    expect(entries).toHaveLength(1);
    const entry = entries[0];
    if (!entry) {
      throw new Error("expected exactly one EARNING ledger entry");
    }
    expect(entry.idempotencyKey).toBe(claimed.idempotencyKey);
    expect(entry.amount.toFixed(4)).toBe("250.0000");
    expect(entry.status).toBe("SETTLED");
    expect(entry.sourceId).toBe(claimed.id.toString());
  });

  it("credits once when the same send is reported concurrently", async () => {
    const fixture = await newFixture({ recipientCount: 1 });
    const claimed = await takeOne(fixture, "w1");

    const base = {
      recipientId: claimed.id,
      blastJobId: fixture.blastJobId,
      userId: fixture.userId,
      workerId: "w1",
      payoutPerSend: fixture.payoutPerSend,
      currency: fixture.currency,
      idempotencyKey: claimed.idempotencyKey,
    };

    const results = await Promise.all([recordSent(base), recordSent(base)]);

    expect(results.filter((r) => r.outcome === "RECORDED")).toHaveLength(1);

    const earnings = await prisma.ledgerEntry.count({
      where: { userId: fixture.userId, type: "EARNING" },
    });
    expect(earnings).toBe(1);
  });

  it("refuses to record SENT for a worker that lost the lease", async () => {
    const fixture = await newFixture({ recipientCount: 1 });
    const claimed = await takeOne(fixture, "w1");

    const result = await recordSent({
      recipientId: claimed.id,
      blastJobId: fixture.blastJobId,
      userId: fixture.userId,
      workerId: "impostor",
      payoutPerSend: fixture.payoutPerSend,
      currency: fixture.currency,
      idempotencyKey: claimed.idempotencyKey,
    });

    expect(result.outcome).toBe("RECONCILIATION_REQUIRED");

    const row = await prisma.campaignRecipient.findUniqueOrThrow({
      where: { id: claimed.id },
      select: { status: true },
    });
    expect(row.status).toBe("RECONCILIATION_REQUIRED");

    expect(
      await prisma.reconciliationEvent.count({
        where: { blastJobId: fixture.blastJobId },
      }),
    ).toBe(1);

    // No money moves for an unconfirmed delivery.
    expect(
      await prisma.ledgerEntry.count({ where: { userId: fixture.userId } }),
    ).toBe(0);
  });
});

describe("failure and ambiguity never pay", () => {
  it("stops retrying past the limit and credits nothing", async () => {
    const fixture = await newFixture({ recipientCount: 1, retryLimit: 1 });

    const claimed = await claimOne(fixture, "w1");
    expect(await markSending({ recipientId: claimed.id, workerId: "w1" })).toBe(
      true,
    );

    const firstOutcome = await recordFailure({
      recipientId: claimed.id,
      workerId: "w1",
      category: "SEND_TIMEOUT",
      reason: "Provider did not respond",
      retryable: true,
      retryLimit: 1,
      backoffMs: 0,
    });
    expect(firstOutcome).toBe("RETRY_SCHEDULED");

    // Backoff already elapsed, so the row is eligible again.
    const retaken = await claimOne(fixture, "w2");
    expect(retaken.id).toBe(claimed.id);
    expect(await markSending({ recipientId: retaken.id, workerId: "w2" })).toBe(
      true,
    );

    const secondOutcome = await recordFailure({
      recipientId: retaken.id,
      workerId: "w2",
      category: "SEND_TIMEOUT",
      reason: "Provider did not respond",
      retryable: true,
      retryLimit: 1,
      backoffMs: 0,
    });
    // attemptCount is now 2 > retryLimit 1, so the row goes terminal.
    expect(secondOutcome).toBe("FAILED");

    const row = await prisma.campaignRecipient.findUniqueOrThrow({
      where: { id: claimed.id },
      select: { status: true, attemptCount: true, nextAttemptAt: true },
    });
    expect(row.status).toBe("FAILED");
    expect(row.attemptCount).toBe(2);
    expect(row.nextAttemptAt).toBeNull();

    expect(
      await prisma.ledgerEntry.count({ where: { userId: fixture.userId } }),
    ).toBe(0);
  });

  it("parks ambiguous sends as UNKNOWN without paying or retrying", async () => {
    const fixture = await newFixture({ recipientCount: 1 });
    const claimed = await claimOne(fixture, "w1");
    expect(await markSending({ recipientId: claimed.id, workerId: "w1" })).toBe(
      true,
    );

    await recordAmbiguous({
      recipientId: claimed.id,
      blastJobId: fixture.blastJobId,
      workerId: "w1",
      reason: "PROVIDER_TIMEOUT",
      detail: "No acknowledgement received",
    });

    const row = await prisma.campaignRecipient.findUniqueOrThrow({
      where: { id: claimed.id },
      select: { status: true, nextAttemptAt: true, leaseExpiresAt: true },
    });
    expect(row.status).toBe("UNKNOWN");
    expect(row.nextAttemptAt).toBeNull();
    expect(row.leaseExpiresAt).toBeNull();

    // UNKNOWN is not an eligible state, so no worker can pick it back up.
    const requeued = await claimRecipients({
      campaignId: fixture.campaignId,
      blastJobId: fixture.blastJobId,
      workerId: "w2",
      limit: 5,
    });
    expect(requeued).toHaveLength(0);

    expect(
      await prisma.ledgerEntry.count({ where: { userId: fixture.userId } }),
    ).toBe(0);
    expect(
      await prisma.reconciliationEvent.count({
        where: { blastJobId: fixture.blastJobId },
      }),
    ).toBe(1);
  });
});

