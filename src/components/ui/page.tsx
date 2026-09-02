import type { ReactNode } from "react";

import { Card, CardContent, IconTile, type IconTileTone } from "@/components/ui/card";
import { Reveal, Stagger, StaggerItem } from "@/components/ui/motion";
import { cn } from "@/lib/utils";

/**
 * Page-composition primitives shared by every dashboard and admin screen.
 *
 * These are presentational only: all values are passed in already formatted and
 * already filtered by the server for the caller's role (RULES.md §5).
 */

/** Page heading with an optional coloured icon and trailing action slot. */
export function PageHeader({
  title,
  description,
  icon,
  tone = "primary",
  actions,
  className,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  tone?: IconTileTone;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3.5">
        {icon ? (
          <IconTile tone={tone} className="mt-0.5 size-11 sm:size-12">
            {icon}
          </IconTile>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

/** Vertical rhythm wrapper for page sections. */
export function PageSections({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mt-6 space-y-6 sm:mt-8 sm:space-y-8", className)}>
      {children}
    </div>
  );
}

/**
 * Responsive stat grid: 1 column on mobile, 2 on tablet, 4 on desktop. Items
 * cascade in via the shared stagger container.
 */
export function StatGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Stagger
      className={cn(
        "grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4",
        className,
      )}
    >
      {children}
    </Stagger>
  );
}

/** Single metric tile. `hint` carries the secondary caption under the value. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "primary",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: ReactNode;
  tone?: IconTileTone;
}) {
  return (
    <StaggerItem>
      <Card hover className="h-full">
        <CardContent className="flex items-start justify-between gap-3 p-5 pt-5 sm:p-6 sm:pt-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 truncate text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]">
              {value}
            </p>
            {hint ? (
              <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
            ) : null}
          </div>
          <IconTile tone={tone}>{icon}</IconTile>
        </CardContent>
      </Card>
    </StaggerItem>
  );
}

/** Section container: heading row plus body, revealed on scroll. */
export function SectionCard({
  title,
  description,
  icon,
  tone = "primary",
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  tone?: IconTileTone;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Reveal>
      <Card className={className}>
        <div className="flex flex-col gap-3 border-b border-border/70 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex min-w-0 items-start gap-3">
            {icon ? <IconTile tone={tone}>{icon}</IconTile> : null}
            <div className="min-w-0">
              <h2 className="text-base font-bold tracking-tight sm:text-lg">
                {title}
              </h2>
              {description ? (
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          ) : null}
        </div>
        <div className={cn("p-5 sm:p-6", bodyClassName)}>{children}</div>
      </Card>
    </Reveal>
  );
}

/** Empty state used whenever a list or table has no rows. */
export function EmptyState({
  title,
  description,
  icon,
  tone = "neutral",
  action,
  className,
}: {
  title: string;
  description?: string;
  icon: ReactNode;
  tone?: IconTileTone;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface/40 px-6 py-12 text-center",
        className,
      )}
    >
      <IconTile tone={tone} className="size-14 rounded-xl">
        {icon}
      </IconTile>
      <p className="mt-4 text-base font-semibold text-foreground">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/** Label/value pair used in detail panels and summaries. */
export function DetailRow({
  label,
  value,
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 border-b border-border/60 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
        className,
      )}
    >
      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon ? (
          <span aria-hidden="true" className="shrink-0">
            {icon}
          </span>
        ) : null}
        {label}
      </span>
      <span className="text-sm font-medium text-foreground sm:text-right">
        {value}
      </span>
    </div>
  );
}

/** Inline callout for policy/consent notices and non-blocking warnings. */
export function Notice({
  tone = "info",
  icon,
  title,
  children,
  className,
}: {
  tone?: "info" | "warning" | "danger" | "success" | "primary";
  icon: ReactNode;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const tones = {
    info: "border-info/30 bg-info/8 text-info",
    warning: "border-warning/35 bg-warning/10 text-warning",
    danger: "border-destructive/30 bg-destructive/8 text-destructive",
    success: "border-success/30 bg-success/8 text-success",
    primary: "border-primary/30 bg-primary/8 text-primary",
  } as const;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border p-4",
        tones[tone],
        className,
      )}
    >
      <span aria-hidden="true" className="mt-0.5 shrink-0">
        {icon}
      </span>
      <div className="min-w-0 text-sm">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? (
          <div
            className={cn(
              "leading-relaxed text-muted-foreground",
              title && "mt-1",
            )}
          >
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}
