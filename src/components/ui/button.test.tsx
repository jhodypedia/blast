import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { Button } from "@/components/ui/button";

/**
 * Button rendering contract.
 *
 * Rendered with `react-dom/server` so the suite stays in the default Node
 * environment (no DOM harness is configured for this project).
 *
 * The `asChild` cases are regression coverage: the button always renders the
 * loading spinner as a sibling of `children`, so the child handed to Radix
 * `Slot` has to be marked `Slottable` or `Slot` throws "failed to slot onto its
 * children" and the whole server component tree 500s.
 */
describe("Button", () => {
  it("renders a native button by default", () => {
    const html = renderToStaticMarkup(<Button>Save</Button>);

    expect(html).toContain("<button");
    expect(html).toContain('data-slot="button"');
    expect(html).toContain("Save");
  });

  it("renders the child element when asChild is set", () => {
    const html = renderToStaticMarkup(
      <Button asChild>
        <a href="https://example.com/docs">New campaign</a>
      </Button>,
    );

    expect(html).toContain("<a");
    expect(html).toContain('href="https://example.com/docs"');
    expect(html).not.toContain("<button");
    expect(html).toContain("New campaign");
  });

  it("merges its own classes into the asChild target", () => {
    const html = renderToStaticMarkup(
      <Button asChild className="w-full">
        <a href="https://example.com/sign-in">Go to sign in</a>
      </Button>,
    );

    expect(html).toContain("inline-flex");
    expect(html).toContain("w-full");
  });

  it("keeps multiple children inside an asChild target", () => {
    const html = renderToStaticMarkup(
      <Button asChild>
        <a href="https://example.com/docs">
          <span data-testid="icon" />
          New campaign
        </a>
      </Button>,
    );

    expect(html).toContain('data-testid="icon"');
    expect(html).toContain("New campaign");
  });

  it("renders the spinner alongside an asChild target while loading", () => {
    const html = renderToStaticMarkup(
      <Button asChild loading>
        <a href="https://example.com/docs">New campaign</a>
      </Button>,
    );

    expect(html).toContain("animate-spin");
    expect(html).toContain("Loading");
    expect(html).toContain("New campaign");
  });

  it("disables and marks a loading native button as busy", () => {
    const html = renderToStaticMarkup(<Button loading>Save</Button>);

    expect(html).toContain("disabled");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("animate-spin");
  });

  it("does not render the spinner when idle", () => {
    const html = renderToStaticMarkup(<Button>Save</Button>);

    expect(html).not.toContain("animate-spin");
    expect(html).not.toContain("aria-busy");
  });
});
