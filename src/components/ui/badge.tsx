import * as React from "react";

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Status badge. Colour semantics follow RULES.md §18:
 * emerald = success/connected/earnings, amber = pending/warning,
 * rose = failed/destructive, cyan = info, primary = active state.
 *
 * Backgrounds are flat colour-mix tints of the semantic token — no gradients —
 * and every combination keeps text above 4.5:1 against the card surface.
 */
const badgeVariants = cva(
  [
    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5",
    "text-xs font-semibold tracking-tight whitespace-nowrap",
    "transition-colors duration-200",
    "[&_svg]:size-3 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        neutral: "border-border bg-surface-strong text-muted-foreground",
        primary: "border-primary/30 bg-primary/12 text-primary",
        success: "border-success/30 bg-success/12 text-success",
        warning: "border-warning/35 bg-warning/15 text-warning",
        danger: "border-destructive/30 bg-destructive/12 text-destructive",
        info: "border-info/30 bg-info/12 text-info",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

const DOT_TONES = {
  neutral: "bg-muted-foreground",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
} as const;

export type BadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    /** Render a leading status dot; `pulse` animates it for live states. */
    dot?: boolean;
    pulse?: boolean;
  };

function Badge({
  className,
  variant,
  dot = false,
  pulse = false,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            DOT_TONES[variant ?? "neutral"],
            pulse && "animate-[glow-pulse_2.6s_ease-in-out_infinite]",
          )}
        />
      ) : null}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
