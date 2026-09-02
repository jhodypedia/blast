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
 * The spinner is a sibling of `children`, so `asChild` must mark the slot target
 * with `Slottable`; otherwise Radix `Slot` sees more than one child and throws.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[transform,box-shadow,background-color,color] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "gradient-primary text-primary-foreground shadow-sm hover:shadow-md",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        success: "bg-success text-success-foreground shadow-sm hover:bg-success/90",
        info: "bg-info text-info-foreground shadow-sm hover:bg-info/90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 min-h-9 px-3 text-xs",
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
