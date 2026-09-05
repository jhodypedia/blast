import type { Metadata } from "next";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileSpreadsheet,
  ListChecks,
  Megaphone,
  PlusCircle,
  Rows3,
  Send,
  Settings2,
  UploadCloud,
  Users,
  XCircle,
} from "lucide-react";

import { requireAdmin } from "@/lib/auth/session";
import {
  getTargetAllocationStats,
  listTargetLists,
} from "@/lib/target/list-service";
import { listCampaignsForAdmin } from "@/lib/admin/queries";
import { listUsers } from "@/lib/admin/service";
import { getSetting } from "@/lib/settings/service";
import { ALLOWED_SPEED_SECONDS, SETTING_KEYS } from "@/lib/constants";
import { Card, CardContent, IconTile } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import {
  EmptyState,
  Notice,
  PageHeader,
  PageSections,
  SectionCard,
  StatCard,
  StatGrid,
} from "@/components/ui/page";
import { UploadTargetListForm } from "@/components/admin/upload-target-list-form";
import { ArchiveTargetListButton } from "@/components/admin/archive-target-list-button";
import { CampaignForm } from "@/components/admin/campaign-form";
import {
  AllocationConfigCard,
  type AllocationSummary,
} from "@/components/admin/allocation-config-card";
import type { CampaignFormValues } from "@/components/admin/campaign-form-shared";

export const metadata: Metadata = { title: "Target nomor" };

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

/** `datetime-local` needs `YYYY-MM-DDTHH:mm` without the timezone suffix. */
function toLocalInput(value: Date): string {
  return value.toISOString().slice(0, 16);
}

/** Blank Baileys configuration for the "new allocation" form. */
function emptyFormValues(params: {
  currency: string;
  payoutPerSend: string;
  targetListId: string;
}): CampaignFormValues {
  const start = new Date();
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

  return {
    name: "",
    description: "",
    internalNotes: "",
    messageType: "TEXT",
    messageText: "",
    mediaKey: "",
    mediaMime: "",
    mediaCaption: "",
    ctaLabel: "",
    ctaUrl: "",
    targetListId: params.targetListId,
    deviceModePolicy: "ALL_DEVICES",
    allowedSpeeds: [...ALLOWED_SPEED_SECONDS],
    payoutPerSend: params.payoutPerSend,
    currency: params.currency,
    quotaPerUser: 100,
    // Bulk blast starts one job per connected device, so the concurrency ceiling
    // has to match the device cap or the fan-out stops after the first device.
    maxConcurrentJobs: 5,
    assignmentPolicy: "SELECTED_USERS",
    assignedUserIds: [],
    allowUserPause: true,
    requireTermsAccept: false,
    retryLimit: 2,
    scheduledStartAt: toLocalInput(start),
    scheduledEndAt: toLocalInput(end),
  };
}


/**
 * Target Nomor — ADMIN only.
 *
 * One page for the whole allocation lifecycle: upload numbers, configure the
 * Baileys message/media/CTA/delay, allocate to operators, and watch the
 * aggregate delivery counters. Numbers themselves are never rendered: only
 * aggregate counts and masked invalid-row samples exist anywhere in the UI
 * (RULES.md §10).
 */
export default async function AdminTargetListsPage() {
  await requireAdmin();

  const [
    lists,
    stats,
    allocations,
    operators,
    defaultCountry,
    maxBytes,
    currency,
    defaultPayout,
  ] = await Promise.all([
    listTargetLists({ includeArchived: true }),
    getTargetAllocationStats(),
    listCampaignsForAdmin({ pageSize: 50 }),
    listUsers({ status: "ACTIVE", pageSize: 100 }),
    getSetting(SETTING_KEYS.defaultCountryCode),
    getSetting(SETTING_KEYS.maxTargetFileBytes),
    getSetting(SETTING_KEYS.defaultCurrency),
    getSetting(SETTING_KEYS.defaultPayoutPerSend),
  ]);

  const ready = lists.filter((list) => list.status === "READY").length;

  const listOptions = lists
    .filter((list) => list.status === "READY")
    .map((list) => ({
      id: list.id,
      label: `${list.name} · ${list.importedCount} nomor`,
    }));

  const operatorOptions = operators.users
    .filter((user) => user.role === "USER")
    .map((user) => ({ id: user.id, label: `${user.name} (${user.email})` }));

  const allocationCards: AllocationSummary[] = allocations.campaigns.map(
    (campaign) => ({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      targetListName: campaign.targetListName,
      targetCount: campaign.targetCount,
      allocatedCount: campaign.recipientCount,
      sentCount: campaign.sentCount,
      operatorCount:
        campaign.config.assignmentPolicy === "SELECTED_USERS"
          ? campaign.config.assignedUserIds.length
          : 0,
      quotaPerUser: campaign.quotaPerUser,
      messageType: campaign.config.messageType,
      allowedSpeeds: campaign.config.allowedSpeeds,
      // Payout, currency and target list freeze once any recipient exists.
      lockEconomics: campaign.recipientCount > 0,
      formValues: {
        id: campaign.id,
        name: campaign.name,
        description: campaign.config.description,
        internalNotes: campaign.config.internalNotes,
        messageType: campaign.config.messageType,
        messageText: campaign.config.messageText,
        mediaKey: campaign.config.mediaKey,
        mediaMime: campaign.config.mediaMime,
        mediaCaption: campaign.config.mediaCaption,
        ctaLabel: campaign.config.ctaLabel,
        ctaUrl: campaign.config.ctaUrl,
        targetListId: campaign.targetListId,
        deviceModePolicy: campaign.config.deviceModePolicy,
        allowedSpeeds: campaign.config.allowedSpeeds,
        payoutPerSend: campaign.payoutPerSend,
        currency: campaign.currency,
        quotaPerUser: campaign.quotaPerUser,
        maxConcurrentJobs: campaign.config.maxConcurrentJobs,
        assignmentPolicy: campaign.config.assignmentPolicy,
        assignedUserIds: campaign.config.assignedUserIds,
        allowUserPause: campaign.config.allowUserPause,
        requireTermsAccept: campaign.config.requireTermsAccept,
        retryLimit: campaign.config.retryLimit,
        scheduledStartAt: toLocalInput(campaign.scheduledStartAt),
        scheduledEndAt: toLocalInput(campaign.scheduledEndAt),
      },
    }),
  );

  return (
    <>
      <PageHeader
        icon={<ListChecks className="size-5" />}
        tone="info"
        title="Target nomor"
        description="Unggah nomor, atur pesan Baileys beserta kecepatan kirim, lalu alokasikan ke operator. Nomor tidak pernah ditampilkan ke operator."
        actions={
          <>
            <Badge variant="success">{ready} daftar siap</Badge>
            <Badge variant="info">{allocationCards.length} alokasi</Badge>
          </>
        }
      />

      <PageSections>
        <StatGrid>
          <StatCard
            label="Nomor terunggah"
            value={stats.uploaded}
            hint="Seluruh daftar nomor"
            tone="info"
            icon={<UploadCloud className="size-5" />}
          />
          <StatCard
            label="Sudah dialokasikan"
            value={stats.allocated}
            hint={`${stats.remaining} belum dialokasikan`}
            tone="primary"
            icon={<Users className="size-5" />}
          />
          <StatCard
            label="Terkirim"
            value={stats.sent}
            hint={`${stats.pending} menunggu`}
            tone="success"
            icon={<CheckCircle2 className="size-5" />}
          />
          <StatCard
            label="Gagal / perlu tinjau"
            value={stats.error}
            hint="Termasuk hasil ambigu"
            tone="warning"
            icon={<XCircle className="size-5" />}
          />
        </StatGrid>

        <SectionCard
          title="Unggah daftar nomor"
          description={`Maksimal ${Math.floor(
            maxBytes / (1024 * 1024),
          )} MB. Nomor lokal tanpa awalan memakai ${defaultCountry} sebagai negara default.`}
          icon={<UploadCloud className="size-5" />}
        >
          <UploadTargetListForm defaultCountryCode={defaultCountry} />
        </SectionCard>

        <SectionCard
          title="Konfigurasi & alokasi baru"
          description="Pilih daftar nomor, tentukan tipe pesan Baileys, kecepatan kirim, kuota, dan operator penerima alokasi."
          icon={<PlusCircle className="size-5" />}
          tone="primary"
        >
          {listOptions.length === 0 ? (
            <Notice
              tone="warning"
              icon={<AlertTriangle className="size-5" />}
              title="Belum ada daftar nomor siap"
            >
              Unggah dan tunggu impor selesai sebelum membuat konfigurasi
              alokasi.
            </Notice>
          ) : operatorOptions.length === 0 ? (
            <Notice
              tone="warning"
              icon={<AlertTriangle className="size-5" />}
              title="Belum ada operator aktif"
            >
              Tambahkan operator aktif terlebih dahulu agar nomor dapat
              dialokasikan.
            </Notice>
          ) : (
            <CampaignForm
              values={emptyFormValues({
                currency,
                payoutPerSend: defaultPayout,
                targetListId: listOptions[0]?.id ?? "",
              })}
              targetLists={listOptions}
              operators={operatorOptions}
            />
          )}
        </SectionCard>

        <SectionCard
          title="Alokasi nomor"
          description="Setiap alokasi membawa konfigurasi pesan, kecepatan, kuota, dan daftar operatornya sendiri."
          icon={<Settings2 className="size-5" />}
          tone="info"
        >
          {allocationCards.length === 0 ? (
            <EmptyState
              icon={<Send className="size-6" />}
              title="Belum ada alokasi"
              description="Buat konfigurasi di atas untuk mengalokasikan nomor ke operator."
            />
          ) : (
            <Stagger className="space-y-4">
              {allocationCards.map((allocation) => (
                <StaggerItem key={allocation.id}>
                  <AllocationConfigCard
                    allocation={allocation}
                    targetLists={listOptions}
                    operators={operatorOptions}
                  />
                </StaggerItem>
              ))}
            </Stagger>
          )}
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
                  <CardContent className="p-4 pt-4 sm:p-5 sm:pt-5">
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
                        <p className="truncate text-base font-black uppercase tracking-tight">
                          {list.name}
                        </p>
                        <p className="mt-0.5 truncate text-xs font-bold text-foreground">
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
                        label="Alokasi"
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
                      <div className="mt-4 border-t-4 border-black pt-4">
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
    success: "bg-success text-success-foreground",
    danger: "bg-destructive text-destructive-foreground",
    warning: "bg-warning text-warning-foreground",
    info: "bg-info text-info-foreground",
  } as const;

  return (
    <div
      className={`border-4 border-black p-3 ${
        tone ? tones[tone] : "bg-surface text-foreground"
      }`}
    >
      <dt className="flex items-center gap-1.5 text-[0.6875rem] font-black uppercase tracking-widest">
        <span aria-hidden="true">{icon}</span>
        {label}
      </dt>
      <dd className="mt-1 text-lg font-black leading-none tracking-tighter">
        {value}
      </dd>
    </div>
  );
}
