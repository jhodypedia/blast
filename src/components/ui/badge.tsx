import * as React from "react";

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Status badge. Colour semantics follow RULES.md §18:
 * emerald = success/connected/earnings, amber = pending/warning,
 * rose = failed/destructive, cyan = info, violet = primary/neutral state.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        neutral: "border-border bg-muted text-muted-foreground",
        primary: "border-primary/20 bg-primary/10 text-primary",
        success: "border-success/25 bg-success/12 text-success",
        warning: "border-warning/30 bg-warning/15 text-warning-foreground",
        danger: "border-destructive/25 bg-destructive/12 text-destructive",
        info: "border-info/25 bg-info/12 text-info",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export type BadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants>;

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
