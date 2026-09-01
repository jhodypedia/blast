/**
 * Circuit breaker for optional infrastructure.
 *
 * Kept free of I/O and environment imports so the state machine is unit
 * testable. Redis is a cache/rate-limit dependency: when it is unreachable we
 * must stop issuing commands that will time out, rather than paying the
 * connection timeout on every request.
 */

export type CircuitState = "CLOSED" | "OPEN";

export type CircuitOptions = {
  /** Consecutive failures required to open the circuit. */
  failureThreshold: number;
  /** How long the circuit stays open before a single probe is allowed. */
  openMs: number;
};

export type CircuitBreaker = {
  state: () => CircuitState;
  /** True when a call may be attempted. */
  allows: () => boolean;
  recordSuccess: () => void;
  recordFailure: () => void;
  failureCount: () => number;
};

/**
 * Creates a breaker. `now` is injectable so tests do not depend on wall clock.
 *
 * After `openMs` elapses the breaker allows exactly one probe by returning to
 * `CLOSED`; a further failure re-opens it immediately, so a dead dependency is
 * retried at most once per window.
 */
export function createCircuitBreaker(
  options: CircuitOptions,
  now: () => number = Date.now,
): CircuitBreaker {
  let failures = 0;
  let openedAt: number | null = null;

  function expired(): boolean {
    return openedAt !== null && now() - openedAt >= options.openMs;
  }

  return {
    state() {
      if (openedAt === null) {
        return "CLOSED";
      }
      return expired() ? "CLOSED" : "OPEN";
    },

    allows() {
      if (openedAt === null) {
        return true;
      }
      if (expired()) {
        // Half-open: reset so the next call is a probe.
        openedAt = null;
        failures = 0;
        return true;
      }
      return false;
    },

    recordSuccess() {
      failures = 0;
      openedAt = null;
    },

    recordFailure() {
      failures += 1;
      if (failures >= options.failureThreshold) {
        openedAt = now();
      }
    },

    failureCount() {
      return failures;
    },
  };
}
