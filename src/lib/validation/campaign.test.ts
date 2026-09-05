import { describe, expect, it } from "vitest";

import {
  campaignTransitionSchema,
  createCampaignSchema,
} from "@/lib/validation/campaign";

/**
 * Campaign validation (RULES.md §6). These rules are the server-side gate on
 * every admin campaign mutation, so the cross-field refinements matter as much
 * as the field types.
 */

const base = {
  name: "Reminder blast",
  description: "Service reminder for opted-in customers",
  messageText: "Hello, your appointment is tomorrow.",
  targetListId: "clh1targetlist0001",
  deviceModePolicy: "SINGLE_DEVICE" as const,
  allowedSpeeds: [1, 3],
  payoutPerSend: "25",
  currency: "idr",
  quotaPerUser: 500,
  maxConcurrentJobs: 1,
  assignmentPolicy: "ALL_ELIGIBLE" as const,
  assignedUserIds: [] as string[],
  allowUserPause: true,
  requireTermsAccept: false,
  retryLimit: 2,
  scheduledStartAt: "2026-01-01T00:00:00.000Z",
  scheduledEndAt: "2026-01-08T00:00:00.000Z",
};

describe("createCampaignSchema", () => {
  it("accepts a well-formed campaign and upper-cases the currency", () => {
    const result = createCampaignSchema.safeParse(base);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe("IDR");
      expect(result.data.scheduledStartAt).toBeInstanceOf(Date);
    }
  });

  it("rejects an end time at or before the start time", () => {
    const result = createCampaignSchema.safeParse({
      ...base,
      scheduledEndAt: base.scheduledStartAt,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.path.includes("scheduledEndAt"),
        ),
      ).toBe(true);
    }
  });

  it("rejects a speed outside 1/3/6/10", () => {
    const result = createCampaignSchema.safeParse({
      ...base,
      allowedSpeeds: [2],
    });

    expect(result.success).toBe(false);
  });

  it("rejects duplicate speeds", () => {
    const result = createCampaignSchema.safeParse({
      ...base,
      allowedSpeeds: [3, 3],
    });

    expect(result.success).toBe(false);
  });

  it("requires at least one operator for a restricted campaign", () => {
    const result = createCampaignSchema.safeParse({
      ...base,
      assignmentPolicy: "SELECTED_USERS",
      assignedUserIds: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.path.includes("assignedUserIds"),
        ),
      ).toBe(true);
    }
  });

  it("requires a URL when a CTA label is set", () => {
    const result = createCampaignSchema.safeParse({
      ...base,
      ctaLabel: "Book now",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a payout with more than four decimal places", () => {
    const result = createCampaignSchema.safeParse({
      ...base,
      payoutPerSend: "25.000001",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a zero quota", () => {
    const result = createCampaignSchema.safeParse({ ...base, quotaPerUser: 0 });

    expect(result.success).toBe(false);
  });

  it("defaults the message type to TEXT", () => {
    const result = createCampaignSchema.safeParse(base);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.messageType).toBe("TEXT");
    }
  });

  it("requires media for an image message", () => {
    const result = createCampaignSchema.safeParse({
      ...base,
      messageType: "IMAGE",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path.includes("mediaKey")),
      ).toBe(true);
    }
  });

  it("accepts an image message that carries media", () => {
    const result = createCampaignSchema.safeParse({
      ...base,
      messageType: "IMAGE",
      mediaKey: "campaign-media/2026-01-01/abc.png",
      mediaMime: "image/png",
    });

    expect(result.success).toBe(true);
  });

  it("requires a label and URL for a button message", () => {
    const result = createCampaignSchema.safeParse({
      ...base,
      messageType: "BUTTON",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path.includes("ctaLabel")),
      ).toBe(true);
    }
  });

  it("accepts a button message that carries a complete CTA", () => {
    const result = createCampaignSchema.safeParse({
      ...base,
      messageType: "BUTTON",
      ctaLabel: "Book now",
      ctaUrl: "https://example.com/book",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an unknown message type", () => {
    const result = createCampaignSchema.safeParse({
      ...base,
      messageType: "VIDEO",
    });

    expect(result.success).toBe(false);
  });
});

describe("campaignTransitionSchema", () => {
  it("accepts a known transition", () => {
    const result = campaignTransitionSchema.safeParse({
      campaignId: "clh1campaign0001",
      action: "ACTIVATE",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an unknown transition", () => {
    const result = campaignTransitionSchema.safeParse({
      campaignId: "clh1campaign0001",
      action: "DELETE",
    });

    expect(result.success).toBe(false);
  });
});
