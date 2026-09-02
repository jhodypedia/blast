import type { Metadata } from "next";
import { MessageSquareQuote, ScrollText, ShieldCheck } from "lucide-react";

import { requireAdmin } from "@/lib/auth/session";
import { listAuditLog } from "@/lib/admin/queries";
import { IconTile } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import {
  EmptyState,
  PageHeader,
  PageSections,
  SectionCard,
} from "@/components/ui/page";

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
    <>
      <PageHeader
        icon={<ScrollText className="size-5" />}
        title="Audit log"
        description="Entries are never edited or deleted."
        actions={<Badge variant="neutral">{total} recorded</Badge>}
      />

      <PageSections>
        <SectionCard
          title="Recent activity"
          description="Newest first."
          icon={<ShieldCheck className="size-5" />}
        >
          {entries.length === 0 ? (
            <EmptyState
              icon={<ScrollText className="size-6" />}
              title="No audit entries yet"
              description="Sensitive admin operations are recorded here automatically."
            />
          ) : (
            <Stagger className="space-y-2">
              {entries.map((entry) => (
                <StaggerItem key={entry.id}>
                  <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface/60 p-3.5 transition-colors hover:border-primary/30 hover:bg-surface sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <IconTile
                        tone={entry.actorRole === "ADMIN" ? "primary" : "info"}
                        className="size-9 shrink-0"
                      >
                        <ScrollText className="size-4" />
                      </IconTile>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {entry.action}
                          <span className="ml-2 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.6875rem] font-medium text-muted-foreground">
                            {entry.resourceType}
                            {entry.resourceId ? `:${entry.resourceId}` : ""}
                          </span>
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {entry.actorEmail ?? "system"} ·{" "}
                          {entry.createdAt
                            .toISOString()
                            .slice(0, 19)
                            .replace("T", " ")}{" "}
                          UTC
                        </p>
                        {entry.reason ? (
                          <p className="mt-1 flex items-start gap-1.5 truncate text-xs text-muted-foreground">
                            <MessageSquareQuote
                              aria-hidden="true"
                              className="mt-0.5 size-3.5 shrink-0 text-info"
                            />
                            <span className="truncate">{entry.reason}</span>
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <Badge
                      variant={
                        entry.actorRole === "ADMIN" ? "primary" : "neutral"
                      }
                      className="self-start sm:self-auto"
                    >
                      {entry.actorRole}
                    </Badge>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </SectionCard>
      </PageSections>
    </>
  );
}
