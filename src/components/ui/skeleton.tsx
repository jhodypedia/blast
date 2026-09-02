import { cn } from "@/lib/utils";

/**
 * Skeleton placeholder for loading states.
 *
 * A green shimmer sweeps across a flat surface tint; both the sweep and the
 * pulse are disabled automatically under `prefers-reduced-motion` by the global
 * rule in globals.css.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        "shimmer rounded-lg border border-border/60 bg-surface-strong",
        className,
      )}
      {...props}
    />
  );
}

/** Multi-line text skeleton for card bodies and list rows. */
function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn("h-3.5", index === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

/** Stat/summary card skeleton matching the dashboard grid. */
function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-xl border border-border bg-card p-5 shadow-panel",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="w-full space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="size-10 rounded-lg" />
      </div>
    </div>
  );
}

export { Skeleton, SkeletonText, SkeletonCard };
