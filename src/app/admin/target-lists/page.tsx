import type { Metadata } from "next";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileSpreadsheet,
  ListChecks,
  Megaphone,
  Rows3,
  UploadCloud,
  XCircle,
} from "lucide-react";

import { requireAdmin } from "@/lib/auth/session";
import { listTargetLists } from "@/lib/target/list-service";
import { getSetting } from "@/lib/settings/service";
import { SETTING_KEYS } from "@/lib/constants";
import { Card, CardContent, IconTile } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import {
  EmptyState,
  Notice,
  PageHeader,
  PageSections,
  SectionCard,
} from "@/components/ui/page";
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

const STATUS_LABEL: Record<string, string> = {
  UPLOADING: "Mengunggah",
  VALIDATING: "Memvalidasi",
  PARSING: "Membaca file",
  IMPORTING: "Mengimpor",
  READY: "Siap",
  FAILED: "Gagal",
  ARCHIVED: "Diarsipkan",
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

  const ready = lists.filter((list) => list.status === "READY").length;

  return (
    <>
      <PageHeader
        icon={<ListChecks className="size-5" />}
        tone="info"
        title="Daftar nomor"
        description="Unggah file .txt atau .csv berisi nomor saja. Proses berjalan di background dan nomor tidak pernah ditampilkan ke operator."
        actions={
          <>
            <Badge variant="success">{ready} siap</Badge>
            <Badge variant="info">{lists.length} total</Badge>
          </>
        }
      />

      <PageSections>
        <SectionCard
          title="Unggah daftar nomor"
          description={`Maksimal ${Math.floor(
            maxBytes / (1024 * 1024),
          )} MB. Local numbers use ${defaultCountry} as the default country.`}
          icon={<UploadCloud className="size-5" />}
        >
          <UploadTargetListForm defaultCountryCode={defaultCountry} />
        </SectionCard>

        {lists.length === 0 ? (
          <EmptyState
            icon={<ListChecks className="size-6" />}
            title="Belum ada daftar nomor"
              description="Unggah file .txt atau .csv yang hanya berisi nomor untuk membuat daftar pertama."
          />
        ) : (
          <Stagger className="space-y-4">
            {lists.map((list) => (
              <StaggerItem key={list.id}>
                <Card hover>
                  <CardContent className="p-5 pt-5 sm:p-6 sm:pt-6">
                    <div className="flex flex-wrap items-start gap-3.5">
                      <IconTile
                        tone={
                          list.status === "READY"
                            ? "success"
                            : list.status === "FAILED"
                              ? "danger"
                              : "info"
                        }
                        className="mt-0.5"
                      >
                        <FileSpreadsheet className="size-5" />
                      </IconTile>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-bold tracking-tight">
                          {list.name}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {list.originalFileName} ·{" "}
                          {list.createdAt.toISOString().slice(0, 10)}
                        </p>
                      </div>
                      <Badge variant={STATUS_VARIANT[list.status] ?? "neutral"}>
                        {STATUS_LABEL[list.status] ?? list.status}
                      </Badge>
                    </div>

                    <dl className="mt-4 grid grid-cols-2 gap-3 min-[480px]:grid-cols-3 lg:grid-cols-5">
                      <Metric
                        label="Baris"
                        value={list.sourceRowCount}
                        icon={<Rows3 className="size-3.5" />}
                      />
                      <Metric
                        label="Masuk"
                        value={list.importedCount}
                        tone="success"
                        icon={<CheckCircle2 className="size-3.5" />}
                      />
                      <Metric
                        label="Duplikat"
                        value={list.duplicateCount}
                        tone="warning"
                        icon={<Copy className="size-3.5" />}
                      />
                      <Metric
                        label="Tidak valid"
                        value={list.invalidCount}
                        tone="danger"
                        icon={<XCircle className="size-3.5" />}
                      />
                      <Metric
                        label="Kampanye"
                        value={list.campaignCount}
                        tone="info"
                        icon={<Megaphone className="size-3.5" />}
                      />
                    </dl>

                    {list.errorSummary ? (
                      <Notice
                        tone="danger"
                        icon={<AlertTriangle className="size-4" />}
                        className="mt-4"
                      >
                        {list.errorSummary}
                      </Notice>
                    ) : null}

                    {list.status !== "ARCHIVED" ? (
                      <div className="mt-4 border-t border-border/70 pt-4">
                        <ArchiveTargetListButton targetListId={list.id} />
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </PageSections>
    </>
  );
}

/** Import-outcome counter tile. Aggregates only, never raw numbers. */
function Metric({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone?: "success" | "danger" | "warning" | "info";
  icon: React.ReactNode;
}) {
  const tones = {
    success: "border-success/25 bg-success/8 text-success",
    danger: "border-destructive/25 bg-destructive/8 text-destructive",
    warning: "border-warning/25 bg-warning/8 text-warning",
    info: "border-info/25 bg-info/8 text-info",
  } as const;

  return (
    <div
      className={`rounded-lg border p-3 ${
        tone ? tones[tone] : "border-border bg-surface/60 text-muted-foreground"
      }`}
    >
      <dt className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider">
        <span aria-hidden="true">{icon}</span>
        {label}
      </dt>
      <dd className="mt-1 text-lg font-bold text-foreground">{value}</dd>
    </div>
  );
}
