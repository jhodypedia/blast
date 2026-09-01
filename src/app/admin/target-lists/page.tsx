import type { Metadata } from "next";
import { ListChecks } from "lucide-react";

import { requireAdmin } from "@/lib/auth/session";
import { listTargetLists } from "@/lib/target/list-service";
import { getSetting } from "@/lib/settings/service";
import { SETTING_KEYS } from "@/lib/constants";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UploadTargetListForm } from "@/components/admin/upload-target-list-form";
import { ArchiveTargetListButton } from "@/components/admin/archive-target-list-button";

export const metadata: Metadata = { title: "Target lists" };

const STATUS_VARIANT: Record<
  string,
  "success" | "warning" | "danger" | "info" | "neutral"
> = {
  UPLOADING: "info",
  VALIDATING: "info",
  PARSING: "info",
  IMPORTING: "info",
  READY: "success",
  FAILED: "danger",
  ARCHIVED: "neutral",
};

/**
 * Target list management. ADMIN only.
 *
 * Numbers are never rendered: only aggregate counts and masked invalid-row
 * samples are available anywhere in the UI (RULES.md §10).
 */
export default async function AdminTargetListsPage() {
  await requireAdmin();

  const [lists, defaultCountry, maxBytes] = await Promise.all([
    listTargetLists({ includeArchived: true }),
    getSetting(SETTING_KEYS.defaultCountryCode),
    getSetting(SETTING_KEYS.maxTargetFileBytes),
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Target lists</h1>
        <p className="text-sm text-muted-foreground">
          Upload phone numbers as .txt or .csv. Imports run in the background and
          numbers are never shown to operators.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Upload a list</CardTitle>
          <CardDescription>
            Maximum {Math.floor(maxBytes / (1024 * 1024))} MB. Local numbers use{" "}
            {defaultCountry} as the default country.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UploadTargetListForm defaultCountryCode={defaultCountry} />
        </CardContent>
      </Card>

      {lists.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <span className="rounded-full bg-muted p-3">
              <ListChecks
                className="size-6 text-muted-foreground"
                aria-hidden="true"
              />
            </span>
            <p className="text-sm text-muted-foreground">
              No target lists yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {lists.map((list) => (
            <Card key={list.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="truncate">{list.name}</CardTitle>
                    <CardDescription className="truncate">
                      {list.originalFileName} ·{" "}
                      {list.createdAt.toISOString().slice(0, 10)}
                    </CardDescription>
                  </div>
                  <Badge variant={STATUS_VARIANT[list.status] ?? "neutral"}>
                    {list.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-5">
                  <Metric label="Rows" value={list.sourceRowCount} />
                  <Metric
                    label="Imported"
                    value={list.importedCount}
                    tone="success"
                  />
                  <Metric label="Duplicates" value={list.duplicateCount} />
                  <Metric
                    label="Invalid"
                    value={list.invalidCount}
                    tone="danger"
                  />
                  <Metric label="Campaigns" value={list.campaignCount} />
                </dl>

                {list.errorSummary ? (
                  <p className="rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-xs text-destructive">
                    {list.errorSummary}
                  </p>
                ) : null}

                {list.status !== "ARCHIVED" ? (
                  <div className="border-t border-border pt-3">
                    <ArchiveTargetListButton targetListId={list.id} />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "danger"
        ? "text-destructive"
        : "";

  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`font-semibold ${toneClass}`}>{value}</dd>
    </div>
  );
}
