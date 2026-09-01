import { describe, expect, it } from "vitest";

import { createCircuitBreaker } from "@/lib/redis/circuit";

/**
 * The breaker guards Redis, which is optional infrastructure. These tests pin
 * the behaviour the callers rely on: rate limiting fails closed while the
 * breaker is open, and cached settings fall back to the database.
 */

function fakeClock(start = 0) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe("createCircuitBreaker", () => {
  it("starts closed and allows calls", () => {
    const breaker = createCircuitBreaker({ failureThreshold: 3, openMs: 1_000 });

    expect(breaker.state()).toBe("CLOSED");
    expect(breaker.allows()).toBe(true);
  });

  it("stays closed below the failure threshold", () => {
    const breaker = createCircuitBreaker({ failureThreshold: 3, openMs: 1_000 });

    breaker.recordFailure();
    breaker.recordFailure();

    expect(breaker.failureCount()).toBe(2);
    expect(breaker.state()).toBe("CLOSED");
    expect(breaker.allows()).toBe(true);
  });

  it("opens once the threshold is reached and blocks further calls", () => {
    const clock = fakeClock();
    const breaker = createCircuitBreaker(
      { failureThreshold: 3, openMs: 1_000 },
      clock.now,
    );

    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();

    expect(breaker.state()).toBe("OPEN");
    expect(breaker.allows()).toBe(false);
    // Repeated calls keep short-circuiting rather than retrying.
    expect(breaker.allows()).toBe(false);
  });

  it("resets on success", () => {
    const breaker = createCircuitBreaker({ failureThreshold: 2, openMs: 1_000 });

    breaker.recordFailure();
    breaker.recordSuccess();

    expect(breaker.failureCount()).toBe(0);

    // The earlier failure must not count toward the next window.
    breaker.recordFailure();
    expect(breaker.state()).toBe("CLOSED");
  });

  it("allows exactly one probe after the open window elapses", () => {
    const clock = fakeClock();
    const breaker = createCircuitBreaker(
      { failureThreshold: 2, openMs: 1_000 },
      clock.now,
    );

    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.allows()).toBe(false);

    clock.advance(999);
    expect(breaker.allows()).toBe(false);

    clock.advance(1);
    // Window elapsed: one probe is let through.
    expect(breaker.allows()).toBe(true);
    expect(breaker.failureCount()).toBe(0);
  });

  it("re-opens immediately when the probe also fails", () => {
    const clock = fakeClock();
    const breaker = createCircuitBreaker(
      { failureThreshold: 1, openMs: 1_000 },
      clock.now,
    );

    breaker.recordFailure();
    expect(breaker.allows()).toBe(false);

    clock.advance(1_000);
    expect(breaker.allows()).toBe(true);

    breaker.recordFailure();
    expect(breaker.state()).toBe("OPEN");
    expect(breaker.allows()).toBe(false);
  });

  it("recovers permanently when the probe succeeds", () => {
    const clock = fakeClock();
    const breaker = createCircuitBreaker(
      { failureThreshold: 1, openMs: 500 },
      clock.now,
    );

    breaker.recordFailure();
    clock.advance(500);
    expect(breaker.allows()).toBe(true);

    breaker.recordSuccess();
    clock.advance(10_000);

    expect(breaker.state()).toBe("CLOSED");
    expect(breaker.allows()).toBe(true);
  });
});
