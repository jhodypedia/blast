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
 * Brutalist treatment: flat rectangle, 4px black border, hard unblurred drop
 * shadow. Hover slams the block up-left into its shadow, press pushes it back
 * down onto the surface and drops the shadow. Only `transform`/`box-shadow`/
 * colour animate, so no layout is recalculated, and the reduced-motion reset in
 * globals.css removes the movement entirely.
 *
 * The spinner is a sibling of `children`, so `asChild` must mark the slot target
 * with `Slottable`; otherwise Radix `Slot` sees more than one child and throws.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap border-4 border-black text-sm font-black uppercase tracking-wide",
    "transition-[transform,box-shadow,background-color,color] duration-100 [transition-timing-function:steps(2,end)]",
    "shadow-[var(--shadow-glow-sm)] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[var(--shadow-glow)]",
    "active:translate-x-0 active:translate-y-0 active:shadow-none",
    "disabled:pointer-events-none disabled:bg-surface-strong disabled:text-black disabled:shadow-none",
    "focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ring",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-surface-strong text-foreground hover:bg-accent",
        outline: "bg-background text-foreground hover:bg-accent",
        ghost:
          "border-transparent bg-transparent text-foreground shadow-none hover:border-black hover:bg-accent hover:shadow-[var(--shadow-glow-sm)]",
        destructive: "bg-destructive text-destructive-foreground",
        success: "bg-success text-success-foreground",
        info: "bg-info text-info-foreground",
        link: "border-transparent bg-transparent text-link underline decoration-2 underline-offset-4 shadow-none hover:translate-x-0 hover:translate-y-0 hover:bg-accent hover:shadow-none",
      },
      size: {
        sm: "h-9 min-h-9 gap-1.5 px-3 text-xs",
        default: "h-11 min-h-11 px-5",
        lg: "h-12 min-h-12 px-7 text-base",
        icon: "size-11 min-h-11 min-w-11 px-0",
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
