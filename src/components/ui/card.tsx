import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Card surface used across dashboards, forms and list items.
 *
 * Depth comes from a solid border plus a flat shadow (no gradients). `hover`
 * opts into the shared lift + emerald border treatment for cards that are
 * themselves interactive (links, selectable rows).
 */
function Card({
  className,
  hover = false,
  ...props
}: React.ComponentProps<"div"> & { hover?: boolean }) {
  return (
    <div
      data-slot="card"
      className={cn(
        "relative rounded-xl border border-border bg-card text-card-foreground shadow-panel",
        hover &&
          "lift hover:border-primary/45 hover:bg-surface hover:shadow-lift",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex flex-col gap-1.5 p-5 sm:p-6", className)}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="card-title"
      className={cn(
        "text-base font-semibold leading-tight tracking-tight text-foreground sm:text-lg",
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-sm leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("p-5 pt-0 sm:p-6 sm:pt-0", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex flex-col gap-3 border-t border-border/70 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Icon tile used in card headers and stat cards. `tone` maps to the semantic
 * colour scale so icons stay meaningful rather than decorative (RULES.md §18).
 */
const TILE_TONES = {
  primary: "bg-primary/12 text-primary ring-primary/25",
  success: "bg-success/12 text-success ring-success/25",
  warning: "bg-warning/15 text-warning ring-warning/25",
  danger: "bg-destructive/12 text-destructive ring-destructive/25",
  info: "bg-info/12 text-info ring-info/25",
  neutral: "bg-surface-strong text-muted-foreground ring-border",
} as const;

export type IconTileTone = keyof typeof TILE_TONES;

function IconTile({
  tone = "primary",
  className,
  ...props
}: React.ComponentProps<"span"> & { tone?: IconTileTone }) {
  return (
    <span
      data-slot="icon-tile"
      aria-hidden="true"
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-lg ring-1 transition-transform duration-200",
        TILE_TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  IconTile,
};
