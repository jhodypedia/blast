import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  AmbientBackground,
  PageTransition,
  Reveal,
  Stagger,
  StaggerItem,
} from "./motion";

/**
 * These primitives wrap every page, so a render-time failure here is a blank
 * screen everywhere. `tsc` cannot catch that: the failures this guards against
 * are runtime invariants of Framer Motion, and one earlier version of this file
 * dropped forwarded props on its reduced-motion branch without any type error.
 *
 * Server rendering is also the exact path Next.js takes first, so it is what
 * these assertions exercise.
 */
describe("motion primitives", () => {
  it("renders children and keeps forwarded props on PageTransition", () => {
    const html = renderToStaticMarkup(
      <PageTransition id="page" className="space-y-6" data-testid="pt">
        <span>content</span>
      </PageTransition>,
    );

    expect(html).toContain("content");
    expect(html).toContain('id="page"');
    expect(html).toContain("space-y-6");
    expect(html).toContain('data-testid="pt"');
  });

  it("renders every staggered child", () => {
    const html = renderToStaticMarkup(
      <Stagger className="grid" delay={0.1} step={0.05}>
        <StaggerItem className="item">
          <span>one</span>
        </StaggerItem>
        <StaggerItem className="item">
          <span>two</span>
        </StaggerItem>
      </Stagger>,
    );

    expect(html).toContain("one");
    expect(html).toContain("two");
    // `delay`/`step` configure the animation and must not leak to the DOM.
    expect(html).not.toContain("step=");
    expect(html).not.toContain("delay=");
  });

  it("renders Reveal without leaking its animation-only props", () => {
    const html = renderToStaticMarkup(
      <Reveal className="reveal" delay={0.2} y={24}>
        <span>revealed</span>
      </Reveal>,
    );

    expect(html).toContain("revealed");
    expect(html).toContain("reveal");
    expect(html).not.toContain('y="24"');
  });

  it("hides the decorative backdrop from assistive technology", () => {
    const html = renderToStaticMarkup(<AmbientBackground />);

    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("pattern-dots");
  });
});
