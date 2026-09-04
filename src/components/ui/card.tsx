import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Card surface used across dashboards, forms and list items.
 *
 * Brutalist treatment: raw white block, 4px black border, hard unblurred drop
 * shadow. `hover` opts into the shared slam-into-the-shadow lift for cards that
 * are themselves interactive (links, selectable rows).
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
        "relative border-4 border-black bg-card text-card-foreground shadow-panel",
        hover && "lift hover:bg-surface",
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
      className={cn("flex flex-col gap-1.5 p-4 sm:p-5", className)}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="card-title"
      className={cn(
        "text-base font-black uppercase leading-tight tracking-tight text-foreground sm:text-lg",
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
      className={cn("text-sm leading-snug text-foreground", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("p-4 pt-0 sm:p-5 sm:pt-0", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex flex-col gap-3 border-t-4 border-black p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Icon tile used in card headers and stat cards. `tone` maps to the semantic
 * colour scale so icons stay meaningful rather than decorative (RULES.md §18).
 * Every tone is a flat, fully saturated fill inside a black box.
 */
const TILE_TONES = {
  primary: "bg-primary text-primary-foreground",
  success: "bg-success text-success-foreground",
  warning: "bg-warning text-warning-foreground",
  danger: "bg-destructive text-destructive-foreground",
  info: "bg-info text-info-foreground",
  neutral: "bg-surface-strong text-foreground",
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
        "inline-flex size-10 shrink-0 items-center justify-center border-4 border-black",
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
