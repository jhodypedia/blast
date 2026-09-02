/**
 * Reconnect policy for the general-purpose Redis client.
 *
 * Kept in its own dependency-free module (no `server-only`, no env access) so it
 * can be unit tested directly.
 *
 * The policy is deliberately bounded. ioredis retries forever by default, and
 * because every failure is logged that turns a single unreachable Redis into an
 * endless stream of `redis.error` lines which drowns out real errors. Once the
 * attempts are exhausted the client settles in the `end` state and the client
 * factory rebuilds it on the next use, so recovery still happens without a
 * process restart.
 */

/** Attempts allowed before the client stops reconnecting. */
export const MAX_RECONNECT_ATTEMPTS = 5;

/** Upper bound on a single backoff delay. */
export const MAX_RECONNECT_DELAY_MS = 5_000;

/**
 * Backoff for reconnect attempt `attempt` (1-based, as ioredis passes it).
 *
 * @returns delay in milliseconds, or `null` to stop reconnecting.
 */
export function reconnectDelay(
  attempt: number,
  maxAttempts: number = MAX_RECONNECT_ATTEMPTS,
): number | null {
  if (attempt > maxAttempts) {
    return null;
  }
  return Math.min(attempt * 200, MAX_RECONNECT_DELAY_MS);
}
