import { describe, expect, it } from "vitest";

import {
  campaignTransitionSchema,
  createCampaignSchema,
  normalizeCampaignContent,
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

  it("defaults the message type to RICH", () => {
    const result = createCampaignSchema.safeParse(base);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.messageType).toBe("RICH");
      expect(result.data.buttons).toEqual([]);
    }
  });

  it("accepts a text-only content block", () => {
    const result = createCampaignSchema.safeParse({ ...base, buttons: [] });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.image1Key).toBeUndefined();
      expect(result.data.buttons).toHaveLength(0);
    }
  });

  it("accepts a content block with one image", () => {
    const result = createCampaignSchema.safeParse({
      ...base,
      image1Key: "campaign-media/2026-01-01/one.png",
      image1Mime: "image/png",
    });

    expect(result.success).toBe(true);
  });

  it("accepts a content block with two images", () => {
    const result = createCampaignSchema.safeParse({
      ...base,
      image1Key: "campaign-media/2026-01-01/one.png",
      image1Mime: "image/png",
      image2Key: "campaign-media/2026-01-01/two.webp",
      image2Mime: "image/webp",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a second image without a first", () => {
    const result = createCampaignSchema.safeParse({
      ...base,
      image2Key: "campaign-media/2026-01-01/two.webp",
      image2Mime: "image/webp",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path.includes("image1Key")),
      ).toBe(true);
    }
  });

  it("rejects an image key without a content type", () => {
    const result = createCampaignSchema.safeParse({
      ...base,
      image1Key: "campaign-media/2026-01-01/one.png",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path.includes("image1Mime")),
      ).toBe(true);
    }
  });

  it("accepts a buttons-only content block with every variant", () => {
    const result = createCampaignSchema.safeParse({
      ...base,
      buttons: [
        { variant: "URL", label: "Buka", value: "https://example.com/promo" },
        { variant: "REPLY", label: "Balas" },
        { variant: "COPY", label: "Salin", value: "PROMO2026" },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.buttons).toHaveLength(3);
    }
  });

  it("rejects more than three buttons", () => {
    const result = createCampaignSchema.safeParse({
      ...base,
      buttons: Array.from({ length: 4 }, (_, index) => ({
        variant: "REPLY",
        label: `Balas ${index}`,
      })),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path.includes("buttons")),
      ).toBe(true);
    }
  });

  it("rejects a URL button without a valid URL", () => {
    const result = createCampaignSchema.safeParse({
      ...base,
      buttons: [{ variant: "URL", label: "Buka", value: "not-a-url" }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path.includes("value")),
      ).toBe(true);
    }
  });

  it("rejects a CALL button without a phone number", () => {
    const result = createCampaignSchema.safeParse({
      ...base,
      buttons: [{ variant: "CALL", label: "Telepon" }],
    });

    expect(result.success).toBe(false);
  });

  it("requires media for a legacy image message", () => {
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

  it("requires a label and URL for a legacy button message", () => {
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

describe("normalizeCampaignContent", () => {
  it("upgrades a legacy mediaKey + ctaLabel payload into the content block", () => {
    const result = createCampaignSchema.safeParse(
      normalizeCampaignContent({
        ...base,
        messageType: "IMAGE",
        mediaKey: "campaign-media/2026-01-01/legacy.png",
        mediaMime: "image/png",
        ctaLabel: "Book now",
        ctaUrl: "https://example.com/book",
      }),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.image1Key).toBe(
        "campaign-media/2026-01-01/legacy.png",
      );
      expect(result.data.image1Mime).toBe("image/png");
      expect(result.data.buttons).toEqual([
        {
          variant: "URL",
          label: "Book now",
          value: "https://example.com/book",
        },
      ]);
      // The legacy columns survive so an older reader keeps working.
      expect(result.data.mediaKey).toBe("campaign-media/2026-01-01/legacy.png");
      expect(result.data.ctaLabel).toBe("Book now");
    }
  });

  it("never overwrites a block the caller already supplied", () => {
    const normalized = normalizeCampaignContent({
      image1Key: "campaign-media/new.png",
      image1Mime: "image/png",
      mediaKey: "campaign-media/legacy.png",
      mediaMime: "image/png",
      buttons: [{ variant: "REPLY", label: "Balas" }],
      ctaLabel: "Legacy",
      ctaUrl: "https://example.com",
    });

    expect(normalized.image1Key).toBe("campaign-media/new.png");
    expect(normalized.buttons).toEqual([{ variant: "REPLY", label: "Balas" }]);
  });

  it("ignores an incomplete legacy CTA", () => {
    const normalized = normalizeCampaignContent({ ctaLabel: "Book now" });

    expect(normalized.buttons).toBeUndefined();
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
