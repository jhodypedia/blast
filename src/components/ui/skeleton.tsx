import { cn } from "@/lib/utils";

/**
 * Skeleton placeholder for loading states. Animation is disabled automatically
 * under `prefers-reduced-motion` by the global rule in globals.css.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
