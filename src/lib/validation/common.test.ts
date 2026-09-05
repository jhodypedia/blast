import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { cuidSchema } from "@/lib/validation/common";

/**
 * Shared identifier rules (RULES.md §9).
 *
 * `cuidSchema` guards every id that crosses a request boundary, so it has to
 * accept every shape the database actually issues. Most models use Prisma
 * `cuid()`, but `BlastJob.id` comes from `randomUUID()` in
 * `src/lib/blast/start-job.ts`, and `Device.publicId` embeds one too.
 */
describe("cuidSchema", () => {
  it("accepts a Prisma cuid", () => {
    expect(cuidSchema.safeParse("clh1job0001abcdef").success).toBe(true);
  });

  it("accepts a randomUUID, the shape BlastJob.id actually holds", () => {
    for (let attempt = 0; attempt < 25; attempt += 1) {
      expect(cuidSchema.safeParse(randomUUID()).success).toBe(true);
    }
  });

  it("trims surrounding whitespace before validating", () => {
    const result = cuidSchema.safeParse("  clh1job0001  ");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("clh1job0001");
    }
  });

  it("rejects separators in positions an id never has", () => {
    for (const value of ["-abc", "abc-", "ab--cd", "-", ""]) {
      expect(cuidSchema.safeParse(value).success).toBe(false);
    }
  });

  it("rejects characters that could carry an injection payload", () => {
    for (const value of [
      "abc def",
      "abc.def",
      "abc'def",
      'abc"def',
      "abc;DROP",
      "abc/def",
      "abc\\def",
      "abc%2F",
      "abc\ndef",
      "../etc",
      "<script>",
    ]) {
      expect(cuidSchema.safeParse(value).success).toBe(false);
    }
  });

  it("rejects an id longer than the storage column", () => {
    expect(cuidSchema.safeParse("a".repeat(65)).success).toBe(false);
    expect(cuidSchema.safeParse("a".repeat(64)).success).toBe(true);
  });
});
