import type {
  OutgoingButton,
  OutgoingButtonVariant,
  OutgoingImage,
  OutgoingMessage,
} from "@/lib/whatsapp/types";

/**
 * Content-block planner (RULES.md §8).
 *
 * The unified content block an ADMIN configures on Target Nomor — up to two
 * images, the message text and up to three buttons — has to arrive as a *single*
 * WhatsApp message. WhatsApp itself has no one message type that covers every
 * combination, so this module decides which shape carries a given block:
 *
 * | images | buttons | plan     | WhatsApp shape                     |
 * | ------ | ------- | -------- | ---------------------------------- |
 * | 0      | 0       | TEXT     | conversation                       |
 * | 1      | 0       | IMAGE    | image + caption                    |
 * | 0      | 1..3    | BUTTONS  | interactive, no header             |
 * | 1      | 1..3    | BUTTONS  | interactive, image header          |
 * | 2      | 0..3    | CAROUSEL | interactive carousel, 2 cards      |
 *
 * Deliberately pure: no Baileys import, no filesystem access, no network. The
 * adapter renders the plan, and these rules stay unit-testable in isolation.
 */

/** Hard ceilings enforced here as well as in the Zod schema and the database. */
export const MAX_CONTENT_IMAGES = 2;
export const MAX_CONTENT_BUTTONS = 3;

/**
 * A two-image block ships as a carousel, and every carousel card must carry its
 * own media. The buttons live on the first card so a single tap target set is
 * presented, which matches how the admin preview renders the block.
 */
export type ContentPlan =
  | { kind: "TEXT"; text: string }
  | { kind: "IMAGE"; text: string; image: OutgoingImage }
  | {
      kind: "BUTTONS";
      text: string;
      image?: OutgoingImage;
      buttons: OutgoingButton[];
    }
  | {
      kind: "CAROUSEL";
      text: string;
      cards: Array<{ image: OutgoingImage; buttons: OutgoingButton[] }>;
    };

/** Drops blank labels and anything past the button ceiling. */
function usableButtons(buttons: OutgoingButton[] | undefined): OutgoingButton[] {
  return (buttons ?? [])
    .filter((button) => button.label.trim().length > 0)
    .filter((button) => button.variant === "REPLY" || Boolean(button.value?.trim()))
    .slice(0, MAX_CONTENT_BUTTONS);
}

/** Drops images that are missing either half of the key/mime pair. */
function usableImages(images: OutgoingImage[] | undefined): OutgoingImage[] {
  return (images ?? [])
    .filter(
      (image) =>
        image.storageKey.trim().length > 0 && image.mimeType.trim().length > 0,
    )
    .slice(0, MAX_CONTENT_IMAGES);
}

/**
 * Chooses the WhatsApp shape for one content block.
 *
 * Incomplete parts are dropped rather than rejected: a block whose second image
 * lost its mime type still sends as a one-image message instead of failing the
 * whole recipient. Validation is the schema's job; this function's contract is
 * that it always yields a sendable plan.
 */
export function planContent(message: OutgoingMessage): ContentPlan {
  const images = usableImages(message.images);
  const buttons = usableButtons(message.buttons);
  const text = message.text;

  if (images.length >= MAX_CONTENT_IMAGES) {
    const [first, second] = images as [OutgoingImage, OutgoingImage];
    return {
      kind: "CAROUSEL",
      text,
      cards: [
        { image: first, buttons },
        { image: second, buttons: [] },
      ],
    };
  }

  const [image] = images;

  if (buttons.length > 0) {
    return {
      kind: "BUTTONS",
      text,
      ...(image ? { image } : {}),
      buttons,
    };
  }

  if (image) {
    return { kind: "IMAGE", text, image };
  }

  return { kind: "TEXT", text };
}

/** Every storage key the plan needs, in the order the adapter must read them. */
export function planImageKeys(plan: ContentPlan): string[] {
  switch (plan.kind) {
    case "TEXT":
      return [];
    case "IMAGE":
      return [plan.image.storageKey];
    case "BUTTONS":
      return plan.image ? [plan.image.storageKey] : [];
    case "CAROUSEL":
      return plan.cards.map((card) => card.image.storageKey);
  }
}

const BUTTON_VARIANTS: readonly OutgoingButtonVariant[] = [
  "URL",
  "REPLY",
  "COPY",
  "CALL",
];

/**
 * Reads a persisted `buttons` JSON column back into typed buttons.
 *
 * The column is `Json?`, so its runtime shape is not guaranteed by the database.
 * Anything that is not a recognisable button is dropped rather than thrown: a
 * malformed row must not be able to abort a delivery run. Zod validates the
 * column on the way in; this is the read-side guard.
 */
export function parseButtons(value: unknown): OutgoingButton[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const buttons: OutgoingButton[] = [];

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }

    const { variant, label, value: payload } = entry as Record<string, unknown>;

    if (
      typeof variant !== "string" ||
      !(BUTTON_VARIANTS as readonly string[]).includes(variant) ||
      typeof label !== "string" ||
      label.trim().length === 0
    ) {
      continue;
    }

    buttons.push({
      variant: variant as OutgoingButtonVariant,
      label: label.trim(),
      ...(typeof payload === "string" && payload.trim().length > 0
        ? { value: payload.trim() }
        : {}),
    });

    if (buttons.length >= MAX_CONTENT_BUTTONS) {
      break;
    }
  }

  return buttons;
}
