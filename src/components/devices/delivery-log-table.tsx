"use client";

import { useMemo, useState } from "react";
import { Filter, ScrollText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/page";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from "@/components/ui/table";

export type DeliveryLogRow = {
  id: string;
  createdAt: string;
  devicePublicId: string | null;
  deviceLabel: string | null;
  /** Non-reversible recipient reference. Never a phone number. */
  recipientRef: string;
  status: string;
  event: string;
  detail: string | null;
  /** Message shape and delay used by the job that produced the row. */
  messageType: "TEXT" | "IMAGE" | "BUTTON";
  speedSeconds: number;
};

const MESSAGE_TYPE_LABEL: Record<DeliveryLogRow["messageType"], string> = {
  TEXT: "Teks",
  IMAGE: "Gambar",
  BUTTON: "Tombol",
};

const STATUS_VARIANT: Record<
  string,
  "success" | "warning" | "danger" | "info" | "neutral"
> = {
  SENT: "success",
  FAILED: "danger",
  RETRYABLE_FAILED: "warning",
  UNKNOWN: "warning",
};

const FILTERS = [
  { value: "ALL", label: "Semua" },
  { value: "SENT", label: "Sukses" },
  { value: "FAILED", label: "Gagal" },
  { value: "RETRYABLE_FAILED", label: "Coba ulang" },
  { value: "UNKNOWN", label: "Ambigu" },
] as const;

/**
 * Operator delivery log for the rolling 24-hour window.
 *
 * Rows arrive already scoped to the caller and already sanitised: the recipient
 * column is a non-reversible reference, so no phone number can be read from this
 * table (RULES.md §16). Filtering is client-side over the same page of rows the
 * server returned, which keeps the interaction instant without widening the
 * query.
 */
export function DeliveryLogTable({ rows }: { rows: DeliveryLogRow[] }) {
  const [status, setStatus] = useState<string>("ALL");

  const filtered = useMemo(
    () => (status === "ALL" ? rows : rows.filter((row) => row.status === status)),
    [rows, status],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-foreground">
          <Filter className="size-3.5" aria-hidden="true" />
          Filter status
        </span>
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={status === option.value}
            onClick={() => setStatus(option.value)}
            className={`min-h-11 border-4 border-black px-3 text-xs font-black uppercase ${
              status === option.value
                ? "bg-primary text-primary-foreground"
                : "bg-background text-foreground hover:bg-accent"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="size-6" />}
          title="Belum ada log"
          description="Log pengiriman muncul di sini dan otomatis hilang setelah 24 jam."
        />
      ) : (
        <>
          {/* Mobile: card list. Desktop: table (RULES.md §18). */}
          <ul className="space-y-2 md:hidden">
            {filtered.map((row) => (
              <li
                key={row.id}
                className="border-4 border-black bg-surface p-3 text-xs font-bold"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono">{row.recipientRef}</span>
                  <Badge variant={STATUS_VARIANT[row.status] ?? "neutral"}>
                    {row.status}
                  </Badge>
                </div>
                <p className="mt-1 uppercase text-foreground">
                  {row.createdAt} · {row.devicePublicId ?? "—"}
                </p>
                <p className="mt-1 uppercase text-foreground">
                  {MESSAGE_TYPE_LABEL[row.messageType]} · {row.speedSeconds}s
                </p>
                {row.detail ? (
                  <p className="mt-1 uppercase text-foreground">{row.detail}</p>
                ) : null}
              </li>
            ))}
          </ul>

          <TableWrapper className="hidden md:block">
            <Table>
              <TableCaption>
                {filtered.length} baris · jendela 24 jam terakhir
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu (UTC)</TableHead>
                  <TableHead>Perangkat</TableHead>
                  <TableHead>Penerima</TableHead>
                  <TableHead>Pesan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Keterangan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">
                      {row.createdAt}
                    </TableCell>
                    <TableCell className="max-w-48 truncate">
                      {row.deviceLabel ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono">
                      {row.recipientRef}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {MESSAGE_TYPE_LABEL[row.messageType]} · {row.speedSeconds}s
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[row.status] ?? "neutral"}>
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-64 truncate">
                      {row.detail ?? row.event}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableWrapper>
        </>
      )}
    </div>
  );
}
