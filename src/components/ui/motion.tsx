"use client";

import {
  MotionConfig,
  motion,
  stagger,
  type HTMLMotionProps,
  type Transition,
} from "framer-motion";

import { cn } from "@/lib/utils";

/**
 * Shared motion primitives.
 *
 * Every animation is limited to `opacity` and `transform` so nothing triggers
 * layout (RULES.md §18).
 *
 * Reduced motion is handled by wrapping each entrance in `MotionConfig` with
 * `reducedMotion="user"`, which makes Framer Motion drop transform animations
 * and keep opacity for users who ask for it. This is deliberately *not* done by
 * branching on `useReducedMotion()`: that hook returns `null` during SSR and can
 * return `true` on the client's first render, so branching on it renders a
 * different tree on each side and produces a hydration mismatch. `MotionConfig`
 * only writes context, so server and client markup stay identical.
 */

const ENTER: Transition = {
  duration: 0.18,
  ease: "linear",
};

/**
 * Page-level entrance: fade in and snap up. Wrap page content; combine with
 * `Stagger` to sequence the sections inside.
 */
export function PageTransition({
  className,
  children,
  ...props
}: HTMLMotionProps<"div">) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={ENTER}
        className={className}
        {...props}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}

/**
 * Staggered container. Direct `StaggerItem` children animate in sequence, which
 * is what gives dashboard grids their cascade on first paint.
 */
export function Stagger({
  className,
  children,
  delay = 0.02,
  step = 0.04,
  ...props
}: HTMLMotionProps<"div"> & { delay?: number; step?: number }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: {
            transition: { delayChildren: stagger(step, { startDelay: delay }) },
          },
        }}
        className={className}
        {...props}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}

/**
 * One cascade step. Only meaningful inside `Stagger`, which supplies the
 * `hidden`/`visible` orchestration and the reduced-motion context.
 */
export function StaggerItem({
  className,
  children,
  ...props
}: HTMLMotionProps<"div">) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 8 },
        visible: { opacity: 1, y: 0 },
      }}
      transition={ENTER}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/**
 * Scroll reveal: fades content in as it enters the viewport. Runs once so
 * scrolling back up does not replay the animation.
 */
export function Reveal({
  className,
  children,
  delay = 0,
  y = 10,
  ...props
}: HTMLMotionProps<"div"> & { delay?: number; y?: number }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        initial={{ opacity: 0, y }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.18, margin: "0px 0px -60px 0px" }}
        transition={{ ...ENTER, delay }}
        className={className}
        {...props}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}

/**
 * Ambient backdrop: stark white ground, a hard structural dot grid and heavy
 * black rules pinned to the viewport edges. Purely decorative and `aria-hidden`.
 * No blur, no gradient wash, no motion.
 */
export function AmbientBackground({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background",
        className,
      )}
    >
      <div className="pattern-dots absolute inset-0" />
      <div className="absolute inset-y-0 left-[12%] w-1 bg-rule" />
      <div className="absolute inset-y-0 right-[22%] w-1 bg-rule" />
      <div className="absolute inset-x-0 top-[30%] h-1 bg-rule" />
    </div>
  );
}
