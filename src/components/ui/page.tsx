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
          <h1 className="text-balance">{title}</h1>
          {description ? (
            <p className="mt-2 max-w-2xl border-l-4 border-black pl-3 text-sm leading-snug text-foreground">
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
        <CardContent className="flex items-start justify-between gap-3 p-4 pt-4 sm:p-5 sm:pt-5">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-widest text-foreground">
              {label}
            </p>
            <p className="mt-2 truncate text-3xl font-black leading-none tracking-tighter text-foreground">
              {value}
            </p>
            {hint ? (
              <p className="mt-2 text-xs font-bold uppercase text-foreground">
                {hint}
              </p>
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
        <div className="flex flex-col gap-3 border-b-4 border-black bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            {icon ? <IconTile tone={tone}>{icon}</IconTile> : null}
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg">{title}</h2>
              {description ? (
                <p className="mt-1 text-sm leading-snug text-foreground">
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
        <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
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
        "flex flex-col items-center justify-center border-4 border-dashed border-black bg-surface px-6 py-12 text-center",
        className,
      )}
    >
      <IconTile tone={tone} className="size-14">
        {icon}
      </IconTile>
      <p className="mt-4 text-base font-black uppercase tracking-wide text-foreground">
        {title}
      </p>
      {description ? (
        <p className="mt-2 max-w-md text-sm leading-snug text-foreground">
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
        "flex flex-col gap-1 border-b-2 border-black py-2.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
        className,
      )}
    >
      <span className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-foreground">
        {icon ? (
          <span aria-hidden="true" className="shrink-0">
            {icon}
          </span>
        ) : null}
        {label}
      </span>
      <span className="text-sm font-bold text-foreground sm:text-right">
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
    info: "bg-info text-info-foreground",
    warning: "bg-warning text-warning-foreground",
    danger: "bg-destructive text-destructive-foreground",
    success: "bg-success text-success-foreground",
    primary: "bg-primary text-primary-foreground",
  } as const;

  return (
    <div
      className={cn(
        "flex items-start gap-3 border-4 border-black p-4 shadow-[var(--shadow-glow-sm)]",
        tones[tone],
        className,
      )}
    >
      <span aria-hidden="true" className="mt-0.5 shrink-0">
        {icon}
      </span>
      <div className="min-w-0 text-sm">
        {title ? (
          <p className="font-black uppercase tracking-wide">{title}</p>
        ) : null}
        {children ? (
          <div className={cn("font-bold leading-snug", title && "mt-1")}>
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}
