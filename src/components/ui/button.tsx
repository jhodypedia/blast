import * as React from "react";

import { Slot, Slottable } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Button primitive.
 *
 * Sizes keep interactive controls at or above the 44x44px touch target on
 * mobile (RULES.md §18). `loading` renders a spinner and disables interaction so
 * async actions always have a visible pending state.
 *
 * Motion: hover scales up slightly and gains an emerald glow, press scales down.
 * Only `transform`/`box-shadow`/colour animate, so no layout is recalculated.
 * Hover transforms are gated behind `hover: hover` via `@media` in Tailwind's
 * `hover:` variant plus the reduced-motion reset in globals.css.
 *
 * The spinner is a sibling of `children`, so `asChild` must mark the slot target
 * with `Slottable`; otherwise Radix `Slot` sees more than one child and throws.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold",
    "transition-[transform,box-shadow,background-color,border-color,color] duration-200 ease-out",
    "hover:-translate-y-px active:translate-y-0 active:scale-[0.97]",
    "disabled:pointer-events-none disabled:opacity-55 disabled:shadow-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    "[&_svg]:transition-transform [&_svg]:duration-200 hover:[&_svg]:scale-110",
  ],
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[var(--shadow-glow-sm)] hover:bg-primary/92 hover:shadow-[var(--shadow-glow)]",
        secondary:
          "bg-secondary text-secondary-foreground border border-border hover:border-border-strong hover:bg-surface-strong",
        outline:
          "border border-border-strong bg-transparent text-foreground hover:border-primary/60 hover:bg-primary/10 hover:text-primary",
        ghost:
          "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        destructive:
          "bg-destructive text-destructive-foreground shadow-panel hover:bg-destructive/90",
        success:
          "bg-success text-success-foreground shadow-panel hover:bg-success/90",
        info: "bg-info text-info-foreground shadow-panel hover:bg-info/90",
        link: "text-primary underline-offset-4 hover:underline hover:translate-y-0",
      },
      size: {
        sm: "h-9 min-h-9 gap-1.5 px-3.5 text-xs",
        default: "h-11 min-h-11 px-5",
        lg: "h-12 min-h-12 px-7 text-base",
        icon: "size-11 min-h-11 min-w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
  };

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : "button";
  // Radix `Slot` accepts a single child unless one is marked `Slottable`. The
  // spinner is rendered as a sibling, so the real child has to be marked.
  const content = asChild ? <Slottable>{children}</Slottable> : children;

  return (
    <Component
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="animate-spin" aria-hidden="true" />
          <span className="sr-only">Loading</span>
        </>
      ) : null}
      {content}
    </Component>
  );
}

export { Button, buttonVariants };
