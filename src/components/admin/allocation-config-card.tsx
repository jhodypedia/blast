"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  ListChecks,
  MessageSquare,
  MousePointerClick,
  Send,
  Timer,
  Users,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CampaignForm } from "@/components/admin/campaign-form";
import { CampaignTransitionControls } from "@/components/admin/campaign-transition-controls";
import type {
  CampaignFormOption,
  CampaignFormValues,
  MessageTypeValue,
} from "@/components/admin/campaign-form-shared";

const STATUS_VARIANT: Record<
  string,
  "success" | "warning" | "danger" | "info" | "neutral"
> = {
  DRAFT: "neutral",
  SCHEDULED: "info",
  ACTIVE: "success",
  PAUSED: "warning",
  COMPLETED: "success",
  PARTIAL_FAILED: "warning",
  CANCELLED: "neutral",
  EXPIRED: "neutral",
  ARCHIVED: "neutral",
};

const MESSAGE_TYPE_LABEL: Record<MessageTypeValue, string> = {
  TEXT: "Teks",
  IMAGE: "Gambar",
  BUTTON: "Tombol",
};

const MESSAGE_TYPE_ICON: Record<MessageTypeValue, React.ReactNode> = {
  TEXT: <MessageSquare className="size-3.5" />,
  IMAGE: <ImageIcon className="size-3.5" />,
  BUTTON: <MousePointerClick className="size-3.5" />,
};

export type AllocationSummary = {
  id: string;
  name: string;
  status: string;
  targetListName: string;
  targetCount: number;
  allocatedCount: number;
  sentCount: number;
  operatorCount: number;
  quotaPerUser: number;
  messageType: MessageTypeValue;
  allowedSpeeds: number[];
  /** True once recipients exist: payout, currency and list are frozen. */
  lockEconomics: boolean;
  formValues: CampaignFormValues;
};

/**
 * One admin allocation row on Target Nomor.
 *
 * The Baileys configuration form is collapsed by default so the page stays
 * scannable; every field it submits is re-validated server-side (RULES.md §6).
 */
export function AllocationConfigCard({
  allocation,
  targetLists,
  operators,
}: {
  allocation: AllocationSummary;
  targetLists: CampaignFormOption[];
  operators: CampaignFormOption[];
}) {
  const [open, setOpen] = useState(false);
  const panelId = `allocation-config-${allocation.id}`;

  return (
    <Card hover>
      <CardContent className="p-4 pt-4 sm:p-5 sm:pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-black uppercase tracking-tight">
              {allocation.name}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold uppercase text-foreground">
              <span className="flex items-center gap-1">
                <ListChecks className="size-3.5 text-info" aria-hidden="true" />
                {allocation.targetListName}
              </span>
              <span className="flex items-center gap-1">
                <span aria-hidden="true">
                  {MESSAGE_TYPE_ICON[allocation.messageType]}
                </span>
                {MESSAGE_TYPE_LABEL[allocation.messageType]}
              </span>
              <span className="flex items-center gap-1">
                <Timer className="size-3.5 text-primary" aria-hidden="true" />
                {allocation.allowedSpeeds.length > 0
                  ? `${allocation.allowedSpeeds.join(" / ")}s`
                  : "belum diatur"}
              </span>
              <span className="flex items-center gap-1">
                <Users className="size-3.5 text-foreground" aria-hidden="true" />
                {allocation.operatorCount === 0
                  ? "semua operator"
                  : `${allocation.operatorCount} operator`}
              </span>
            </p>
          </div>
          <Badge variant={STATUS_VARIANT[allocation.status] ?? "neutral"}>
            {allocation.status}
          </Badge>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 min-[480px]:grid-cols-4">
          <Metric
            label="Nomor daftar"
            value={allocation.targetCount}
            icon={<ListChecks className="size-3.5" />}
          />
          <Metric
            label="Dialokasikan"
            value={allocation.allocatedCount}
            tone="info"
            icon={<Send className="size-3.5" />}
          />
          <Metric
            label="Terkirim"
            value={allocation.sentCount}
            tone="success"
            icon={<CheckCircle2 className="size-3.5" />}
          />
          <Metric
            label="Kuota / operator"
            value={allocation.quotaPerUser}
            icon={<XCircle className="size-3.5" />}
          />
        </dl>

        <div className="mt-4 border-t-4 border-black pt-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={panelId}
          >
            {open ? (
              <>
                <ChevronUp aria-hidden="true" />
                Tutup konfigurasi
              </>
            ) : (
              <>
                <ChevronDown aria-hidden="true" />
                Ubah konfigurasi pesan &amp; alokasi
              </>
            )}
          </Button>
        </div>

        {open ? (
          <div id={panelId} className="mt-4 border-t-4 border-black pt-4">
            <CampaignForm
              values={allocation.formValues}
              targetLists={targetLists}
              operators={operators}
              lockEconomics={allocation.lockEconomics}
            />
          </div>
        ) : null}

        <CampaignTransitionControls
          campaignId={allocation.id}
          status={allocation.status}
        />
      </CardContent>
    </Card>
  );
}

/** Aggregate counter tile. Never renders a target number. */
function Metric({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone?: "success" | "info";
  icon: React.ReactNode;
}) {
  const tones = {
    success: "bg-success text-success-foreground",
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
