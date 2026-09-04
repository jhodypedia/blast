import { cn } from "@/lib/utils";

/**
 * Skeleton placeholder for loading states.
 *
 * Brutalist treatment: a raw grey block inside a black rule with a stepped
 * sweep. The sweep is disabled automatically under `prefers-reduced-motion` by
 * the global rule in globals.css.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("shimmer border-2 border-black bg-surface-strong", className)}
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
        "border-4 border-black bg-card p-4 shadow-panel sm:p-5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="w-full space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="size-10" />
      </div>
    </div>
  );
}

export { Skeleton, SkeletonText, SkeletonCard };
