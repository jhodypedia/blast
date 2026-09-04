import * as React from "react";

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Status badge. Colour semantics follow RULES.md §18:
 * green = success/connected/earnings, yellow = pending/warning,
 * red = failed/destructive, cyan = info, blue = active state.
 *
 * Brutalist treatment: square block, thick black border, fully saturated flat
 * fill. Every fill/ink pairing keeps text above 4.5:1.
 */
const badgeVariants = cva(
  [
    "inline-flex items-center gap-1.5 border-2 border-black px-2 py-0.5",
    "font-mono text-xs font-black uppercase tracking-wider whitespace-nowrap",
    "[&_svg]:size-3 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        neutral: "bg-surface-strong text-foreground",
        primary: "bg-primary text-primary-foreground",
        success: "bg-success text-success-foreground",
        warning: "bg-warning text-warning-foreground",
        danger: "bg-destructive text-destructive-foreground",
        info: "bg-info text-info-foreground",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

const DOT_TONES = {
  neutral: "bg-foreground",
  primary: "bg-primary-foreground",
  success: "bg-success-foreground",
  warning: "bg-warning-foreground",
  danger: "bg-destructive-foreground",
  info: "bg-info-foreground",
} as const;

export type BadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    /** Render a leading status block; `pulse` blinks it for live states. */
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
            "size-2 shrink-0",
            DOT_TONES[variant ?? "neutral"],
            pulse && "animate-[blink_1s_steps(1,end)_infinite]",
          )}
        />
      ) : null}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
