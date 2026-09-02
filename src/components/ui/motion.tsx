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
  duration: 0.45,
  ease: [0.22, 1, 0.36, 1],
};

/**
 * Page-level entrance: fade in and slide up. Wrap page content; combine with
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
        initial={{ opacity: 0, y: 14 }}
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
  delay = 0.04,
  step = 0.06,
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
        hidden: { opacity: 0, y: 12 },
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
  y = 18,
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
 * Ambient backdrop: flat dark-green wash, a low-opacity dot grid and two very
 * slowly drifting green blocks. Purely decorative and `aria-hidden`; the drift
 * is CSS-driven (transform only) and stops under reduced motion via
 * `motion-safe:`.
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
      <div className="pattern-dots absolute inset-0 opacity-40" />
      <div className="absolute -left-28 -top-28 size-[26rem] rounded-full bg-primary/6 blur-3xl motion-safe:animate-[drift_22s_ease-in-out_infinite]" />
      <div className="absolute -bottom-40 -right-24 size-[30rem] rounded-full bg-success/5 blur-3xl motion-safe:animate-[drift_28s_ease-in-out_infinite_reverse]" />
    </div>
  );
}
