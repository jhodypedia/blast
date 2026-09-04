import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Text input primitive. Height meets the 44px touch-target minimum.
 *
 * Brutalist treatment: raw white rectangle inside a 4px black border, no radius,
 * no inner shading. Focus fills the field with hazard yellow and adds a hard
 * magenta outline; invalid state flips the fill to red-on-white so validation is
 * visible without relying on colour alone (the field also renders an icon +
 * message via the form primitives).
 */
const inputClassName = [
  "flex h-11 w-full border-4 border-black bg-background px-3 py-2 font-mono text-sm text-foreground",
  "transition-[background-color,box-shadow] duration-100 [transition-timing-function:steps(2,end)]",
  "placeholder:text-black placeholder:opacity-100 placeholder:uppercase",
  "hover:bg-surface",
  "focus:bg-accent focus:text-accent-foreground focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ring",
  "disabled:cursor-not-allowed disabled:bg-surface-strong disabled:text-black",
  "aria-invalid:bg-destructive aria-invalid:text-destructive-foreground aria-invalid:placeholder:text-destructive-foreground",
  "file:mr-3 file:border-0 file:border-r-4 file:border-black file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-black file:uppercase file:text-primary-foreground",
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
