import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Text input primitive. Height meets the 44px touch-target minimum.
 *
 * Focus draws an animated emerald ring + border; invalid state switches the ring
 * to the destructive tone so validation is visible without relying on colour
 * alone (the field also renders an icon + message via the form primitives).
 */
const inputClassName = [
  "flex h-11 w-full rounded-lg border border-input bg-surface px-3.5 py-2 text-sm text-foreground",
  "shadow-[inset_0_1px_0_oklch(1_0_0_/_0.03)]",
  "transition-[border-color,box-shadow,background-color] duration-200 ease-out",
  "placeholder:text-muted-foreground/80",
  "hover:border-border-strong",
  "focus:border-primary focus:bg-surface-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-0",
  "disabled:cursor-not-allowed disabled:opacity-55",
  "aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/50",
  "file:mr-3 file:rounded-md file:border-0 file:bg-primary/15 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary",
].join(" ");

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(inputClassName, className)}
      {...props}
    />
  );
}

/** Multi-line variant sharing the same focus/invalid treatment. */
function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(inputClassName, "h-auto min-h-28 py-2.5", className)}
      {...props}
    />
  );
}

/**
 * Native select styled to match. A chevron is drawn by the wrapping field in
 * page code; `appearance-none` keeps the control on-palette across browsers.
 */
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(inputClassName, "appearance-none pr-9", className)}
      {...props}
    />
  );
}

export { Input, Textarea, Select, inputClassName };
