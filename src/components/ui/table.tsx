import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Table primitives.
 *
 * Wrapped in a horizontally scrollable container so wide admin tables never
 * break the mobile layout; pages that need a denser mobile view render a card
 * list instead (RULES.md §18 responsive table alternatives).
 *
 * Brutalist treatment: every cell draws its own black rule, so the grid itself
 * is the visual structure. Header is inverted (white on black), rows highlight
 * to hazard yellow on hover and selection.
 */
function TableWrapper({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="table-wrapper"
      className={cn(
        "w-full overflow-x-auto border-4 border-black bg-card shadow-panel",
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
      className={cn(
        "w-full caption-bottom border-collapse font-mono text-sm",
        className,
      )}
      {...props}
    />
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("border-b-4 border-black bg-foreground", className)}
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
        "border-b-2 border-black last:border-b-0",
        "hover:bg-accent data-[state=selected]:bg-accent",
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
        "h-11 whitespace-nowrap border-r-2 border-background px-3 text-left align-middle text-xs font-black uppercase tracking-widest text-background last:border-r-0",
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
      className={cn(
        "border-r-2 border-black px-3 py-2.5 align-middle text-foreground last:border-r-0",
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn(
        "border-t-4 border-black px-3 py-2 text-left text-xs font-bold uppercase text-foreground",
        className,
      )}
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
