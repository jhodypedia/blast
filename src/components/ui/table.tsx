import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Table primitives.
 *
 * Wrapped in a horizontally scrollable container so wide admin tables never
 * break the mobile layout; pages that need a denser mobile view render a card
 * list instead (RULES.md §18 responsive table alternatives).
 *
 * Rows are striped with a flat surface tint and highlight on hover.
 */
function TableWrapper({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="table-wrapper"
      className={cn(
        "w-full overflow-x-auto rounded-xl border border-border bg-card shadow-panel",
        className,
      )}
      {...props}
    />
  );
}

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <table
      data-slot="table"
      className={cn("w-full caption-bottom border-collapse text-sm", className)}
      {...props}
    />
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("bg-surface-strong", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={className} {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-border/70 transition-colors duration-150 last:border-0",
        "even:bg-surface/40 hover:bg-primary/8 data-[state=selected]:bg-primary/10",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-11 whitespace-nowrap px-4 text-left align-middle text-xs font-bold uppercase tracking-wider text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn("px-4 py-3 align-middle text-foreground", className)}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("px-4 py-3 text-left text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  TableWrapper,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
};
