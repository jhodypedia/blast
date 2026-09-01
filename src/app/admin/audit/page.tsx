import type { Metadata } from "next";
import { ScrollText } from "lucide-react";

import { requireAdmin } from "@/lib/auth/session";
import { listAuditLog } from "@/lib/admin/queries";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Audit log" };

/**
 * Immutable audit trail.
 *
 * Summaries are sanitised at write time, so nothing here can contain a phone
 * number, credential or unmasked account detail (RULES.md §16).
 */
export default async function AdminAuditPage() {
  await requireAdmin();
  const { entries, total } = await listAuditLog({ pageSize: 100 });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          {total} recorded action{total === 1 ? "" : "s"}. Entries are never
          edited or deleted.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>Newest first.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <span className="rounded-full bg-muted p-3">
                <ScrollText
                  className="size-6 text-muted-foreground"
                  aria-hidden="true"
                />
              </span>
              <p className="text-sm text-muted-foreground">
                No audit entries yet.
              </p>
            </div>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-col gap-1 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {entry.action}
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {entry.resourceType}
                      {entry.resourceId ? `:${entry.resourceId}` : ""}
                    </span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {entry.actorEmail ?? "system"} ·{" "}
                    {entry.createdAt
                      .toISOString()
                      .slice(0, 19)
                      .replace("T", " ")}{" "}
                    UTC
                  </p>
                  {entry.reason ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {entry.reason}
                    </p>
                  ) : null}
                </div>
                <Badge
                  variant={entry.actorRole === "ADMIN" ? "primary" : "neutral"}
                >
                  {entry.actorRole}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
