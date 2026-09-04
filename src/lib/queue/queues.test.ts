import { beforeEach, describe, expect, it, vi } from "vitest";

import { QUEUE_NAMES } from "@/lib/constants";

/**
 * Delivery re-enqueue recovery (RULES.md §13).
 *
 * `enqueueBlastDelivery` uses a deterministic job id, so a settled job key makes
 * a plain re-add a silent no-op. These tests pin the only safe recovery order:
 * inspect state, drop a settled key, and never touch a key another worker still
 * holds.
 */

type FakeJob = {
  id: string;
  state: "completed" | "failed" | "active" | "waiting" | "delayed" | "unknown";
  getState: () => Promise<FakeJob["state"]>;
};

class FakeQueue {
  static readonly instances: FakeQueue[] = [];

  readonly added: Array<{
    name: string;
    data: unknown;
    opts: Record<string, unknown> | undefined;
  }> = [];

  readonly removed: string[] = [];

  job: FakeJob | undefined;

  /** Mirrors BullMQ: 0 means the job lock is held by a running worker. */
  removeResult = 1;

  constructor(readonly name: string) {
    FakeQueue.instances.push(this);
  }

  getJob = vi.fn(async (): Promise<FakeJob | undefined> => this.job);

  remove = vi.fn(async (jobId: string): Promise<number> => {
    this.removed.push(jobId);
    if (this.removeResult > 0) {
      this.job = undefined;
    }
    return this.removeResult;
  });

  add = vi.fn(
    async (
      name: string,
      data: unknown,
      opts?: Record<string, unknown>,
    ): Promise<void> => {
      this.added.push({ name, data, opts });
    },
  );
}

vi.mock("bullmq", () => ({
  Queue: FakeQueue,
}));

vi.mock("@/lib/redis/client", () => ({
  createQueueConnection: () => ({ fake: true }),
}));

const globalForQueues = globalThis as unknown as {
  wablastQueues?: Map<string, unknown>;
};

function stageJob(state: FakeJob["state"]): FakeJob {
  return {
    id: "blast-job-1",
    state,
    getState: async () => state,
  };
}

let queues: typeof import("@/lib/queue/queues");

beforeEach(async () => {
  vi.clearAllMocks();
  FakeQueue.instances.length = 0;
  // The producer caches queues on globalThis to survive hot reload; each test
  // needs its own instance.
  delete globalForQueues.wablastQueues;
  queues = await import("@/lib/queue/queues");
});

function deliveryQueue(): FakeQueue {
  const queue = FakeQueue.instances.find(
    (instance) => instance.name === QUEUE_NAMES.blastDelivery,
  );
  if (!queue) {
    throw new Error("The delivery queue was never created");
  }
  return queue;
}

describe("blastDeliveryJobId", () => {
  it("derives the job id from the blast job id", () => {
    expect(queues.blastDeliveryJobId("job-1")).toBe("blast-job-1");
  });
});

describe("requeueBlastDelivery", () => {
  it("enqueues when no queue job exists", async () => {
    const outcome = await queues.requeueBlastDelivery("job-1");

    expect(outcome).toBe("REQUEUED");
    const queue = deliveryQueue();
    expect(queue.removed).toEqual([]);
    expect(queue.added).toEqual([
      {
        name: QUEUE_NAMES.blastDelivery,
        data: { blastJobId: "job-1" },
        opts: { jobId: "blast-job-1", attempts: 1 },
      },
    ]);
  });

  it.each(["active", "waiting", "delayed"] as const)(
    "leaves a live %s job untouched",
    async (state) => {
      const outcome = await queues.requeueBlastDelivery("job-1");
      expect(outcome).toBe("REQUEUED");

      const queue = deliveryQueue();
      queue.job = stageJob(state);
      queue.added.length = 0;

      expect(await queues.requeueBlastDelivery("job-1")).toBe("ALREADY_QUEUED");
      expect(queue.removed).toEqual([]);
      expect(queue.added).toEqual([]);
    },
  );

  it.each(["failed", "completed", "unknown"] as const)(
    "clears a settled %s job before re-adding",
    async (state) => {
      await queues.requeueBlastDelivery("job-1");
      const queue = deliveryQueue();
      queue.job = stageJob(state);
      queue.added.length = 0;

      expect(await queues.requeueBlastDelivery("job-1")).toBe("REQUEUED");
      expect(queue.removed).toEqual(["blast-job-1"]);
      expect(queue.added).toHaveLength(1);
      expect(queue.added[0]?.opts).toEqual({
        jobId: "blast-job-1",
        attempts: 1,
      });
    },
  );

  it("does not enqueue while another worker holds the job lock", async () => {
    await queues.requeueBlastDelivery("job-1");
    const queue = deliveryQueue();
    queue.job = stageJob("failed");
    queue.removeResult = 0;
    queue.added.length = 0;

    expect(await queues.requeueBlastDelivery("job-1")).toBe("LOCKED");
    expect(queue.removed).toEqual(["blast-job-1"]);
    expect(queue.added).toEqual([]);
  });
});
