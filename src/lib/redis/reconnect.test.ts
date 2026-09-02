import { describe, expect, it } from "vitest";

import {
  MAX_RECONNECT_ATTEMPTS,
  MAX_RECONNECT_DELAY_MS,
  reconnectDelay,
} from "@/lib/redis/reconnect";

/**
 * The general-purpose Redis client must stop reconnecting eventually. Without a
 * ceiling, one unreachable Redis produced a `redis.error` log line every few
 * hundred milliseconds forever, which made real errors unreadable in the dev
 * server output.
 */

describe("reconnectDelay", () => {
  it("backs off linearly on early attempts", () => {
    expect(reconnectDelay(1)).toBe(200);
    expect(reconnectDelay(2)).toBe(400);
    expect(reconnectDelay(3)).toBe(600);
  });

  it("never exceeds the delay ceiling", () => {
    expect(reconnectDelay(1_000, 10_000)).toBe(MAX_RECONNECT_DELAY_MS);
  });

  it("keeps retrying up to and including the last allowed attempt", () => {
    expect(reconnectDelay(MAX_RECONNECT_ATTEMPTS)).not.toBeNull();
  });

  it("gives up past the attempt ceiling", () => {
    expect(reconnectDelay(MAX_RECONNECT_ATTEMPTS + 1)).toBeNull();
  });

  it("honours a custom attempt ceiling", () => {
    expect(reconnectDelay(2, 2)).toBe(400);
    expect(reconnectDelay(3, 2)).toBeNull();
  });
});
