"use client";

import * as React from "react";

import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

/**
 * Progress bar for blast-job delivery.
 *
 * Brutalist treatment: a blocky, square, unstyled bar inside a thick black
 * frame. The indicator is translated (never width-animated) so the fill stays on
 * the compositor. Values always come from authoritative server counts — the bar
 * never advances on its own (RULES.md §13).
 */
const TONES = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
} as const;

export type ProgressTone = keyof typeof TONES;

function Progress({
  className,
  value,
  tone = "primary",
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
  tone?: ProgressTone;
}) {
  const clamped = Math.min(100, Math.max(0, value ?? 0));

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={clamped}
      className={cn(
        "relative h-5 w-full overflow-hidden border-4 border-black bg-surface-strong",
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "h-full w-full transition-transform duration-300 [transition-timing-function:steps(10,end)]",
          TONES[tone],
        )}
        style={{ transform: `translateX(-${100 - clamped}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
