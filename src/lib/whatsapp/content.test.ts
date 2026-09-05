import { describe, expect, it } from "vitest";

import {
  MAX_CONTENT_BUTTONS,
  parseButtons,
  planContent,
  planImageKeys,
} from "@/lib/whatsapp/content";
import type { OutgoingMessage } from "@/lib/whatsapp/types";

/**
 * Content-block planning (RULES.md §8).
 *
 * The planner decides which single WhatsApp shape carries a given block, so these
 * cases are the contract the adapter renders against.
 */

const base: OutgoingMessage = {
  normalizedNumber: "628111222333",
  text: "Hello, your appointment is tomorrow.",
};

const image = (name: string) => ({
  storageKey: `campaign-media/2026-01-01/${name}.png`,
  mimeType: "image/png",
});

describe("planContent", () => {
  it("plans a text-only block as a plain text message", () => {
    const plan = planContent(base);

    expect(plan.kind).toBe("TEXT");
    expect(planImageKeys(plan)).toEqual([]);
  });

  it("plans one image with no buttons as an image message", () => {
    const plan = planContent({ ...base, images: [image("one")] });

    expect(plan.kind).toBe("IMAGE");
    expect(planImageKeys(plan)).toEqual([image("one").storageKey]);
  });

  it("plans buttons with no image as a headerless interactive message", () => {
    const plan = planContent({
      ...base,
      buttons: [{ variant: "URL", label: "Buka", value: "https://example.com" }],
    });

    expect(plan.kind).toBe("BUTTONS");
    if (plan.kind === "BUTTONS") {
      expect(plan.image).toBeUndefined();
      expect(plan.buttons).toHaveLength(1);
    }
  });

  it("plans one image plus buttons as one interactive message", () => {
    const plan = planContent({
      ...base,
      images: [image("one")],
      buttons: [{ variant: "REPLY", label: "Balas" }],
    });

    expect(plan.kind).toBe("BUTTONS");
    if (plan.kind === "BUTTONS") {
      expect(plan.image?.storageKey).toBe(image("one").storageKey);
    }
  });

  it("plans two images as a two-card carousel with buttons on the first card", () => {
    const plan = planContent({
      ...base,
      images: [image("one"), image("two")],
      buttons: [{ variant: "COPY", label: "Salin", value: "PROMO" }],
    });

    expect(plan.kind).toBe("CAROUSEL");
    if (plan.kind === "CAROUSEL") {
      expect(plan.cards).toHaveLength(2);
      expect(plan.cards[0]?.buttons).toHaveLength(1);
      expect(plan.cards[1]?.buttons).toHaveLength(0);
    }
    expect(planImageKeys(plan)).toEqual([
      image("one").storageKey,
      image("two").storageKey,
    ]);
  });

  it("drops an image that is missing its mime type instead of failing", () => {
    const plan = planContent({
      ...base,
      images: [image("one"), { storageKey: "campaign-media/two.png", mimeType: "" }],
    });

    expect(plan.kind).toBe("IMAGE");
  });

  it("drops a blank-labelled button and a payload-less non-reply button", () => {
    const plan = planContent({
      ...base,
      buttons: [
        { variant: "URL", label: "   ", value: "https://example.com" },
        { variant: "CALL", label: "Telepon" },
      ],
    });

    expect(plan.kind).toBe("TEXT");
  });

  it("never plans more than the button ceiling", () => {
    const plan = planContent({
      ...base,
      buttons: Array.from({ length: 5 }, (_, index) => ({
        variant: "REPLY" as const,
        label: `Balas ${index}`,
      })),
    });

    expect(plan.kind).toBe("BUTTONS");
    if (plan.kind === "BUTTONS") {
      expect(plan.buttons).toHaveLength(MAX_CONTENT_BUTTONS);
    }
  });

  it("ignores a third image", () => {
    const plan = planContent({
      ...base,
      images: [image("one"), image("two"), image("three")],
    });

    expect(planImageKeys(plan)).toHaveLength(2);
  });
});

describe("parseButtons", () => {
  it("reads a well-formed persisted array", () => {
    expect(
      parseButtons([
        { variant: "URL", label: "Buka", value: "https://example.com" },
        { variant: "REPLY", label: "Balas" },
      ]),
    ).toEqual([
      { variant: "URL", label: "Buka", value: "https://example.com" },
      { variant: "REPLY", label: "Balas" },
    ]);
  });

  it("returns nothing for a non-array column", () => {
    expect(parseButtons(null)).toEqual([]);
    expect(parseButtons("URL")).toEqual([]);
    expect(parseButtons({ variant: "URL", label: "Buka" })).toEqual([]);
  });

  it("drops unrecognised entries rather than throwing", () => {
    expect(
      parseButtons([
        { variant: "TELEPATHY", label: "Kirim pikiran" },
        { variant: "URL" },
        null,
        42,
        { variant: "COPY", label: "Salin", value: "PROMO" },
      ]),
    ).toEqual([{ variant: "COPY", label: "Salin", value: "PROMO" }]);
  });

  it("caps a persisted array at the button ceiling", () => {
    const stored = Array.from({ length: 6 }, (_, index) => ({
      variant: "REPLY",
      label: `Balas ${index}`,
    }));

    expect(parseButtons(stored)).toHaveLength(MAX_CONTENT_BUTTONS);
  });
});
