import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  LayoutDashboard,
  Megaphone,
  Send,
  ShieldAlert,
  Users,
  Wallet,
} from "lucide-react";

import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getSetting } from "@/lib/settings/service";
import { SETTING_KEYS } from "@/lib/constants";
import { formatMoney, toMoneyString } from "@/lib/money";
import { Card, CardContent, IconTile, type IconTileTone } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import {
  PageHeader,
  PageSections,
  SectionCard,
} from "@/components/ui/page";

export const metadata: Metadata = { title: "Admin overview" };

/** Operational overview. Counts are read directly from authoritative tables. */
export default async function AdminOverviewPage() {
  await requireAdmin();
  const currency = await getSetting(SETTING_KEYS.defaultCurrency);

  const [
    activeCampaigns,
    liveJobs,
    operators,
    pendingWithdrawals,
    pendingAmount,
    reconciliation,
  ] = await Promise.all([
    prisma.campaign.count({ where: { status: "ACTIVE", archivedAt: null } }),
    prisma.blastJob.count({
      where: { status: { in: ["QUEUED", "RUNNING", "PAUSED"] } },
    }),
    prisma.user.count({ where: { role: "USER", deletedAt: null } }),
    prisma.withdrawal.count({ where: { status: "PENDING" } }),
    prisma.withdrawal.aggregate({
      where: { status: { in: ["PENDING", "PROCESSING", "APPROVED"] } },
      _sum: { netAmount: true },
    }),
    prisma.campaignRecipient.count({
      where: { status: { in: ["UNKNOWN", "RECONCILIATION_REQUIRED"] } },
    }),
  ]);

  return (
    <>
      <PageHeader
        icon={<LayoutDashboard className="size-5" />}
        title="Ringkasan operasional"
        description="Pantau kampanye, delivery, operator, dan pembayaran dari satu tempat."
      />

      <PageSections>
        <Stagger className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4">
          <LinkStat
            href="/admin/campaigns"
            label="Kampanye aktif"
            value={String(activeCampaigns)}
            hint="Siap dijalankan"
            tone="info"
            icon={<Megaphone className="size-5" />}
          />
          <LinkStat
            href="/admin/jobs"
            label="Blast berjalan"
            value={String(liveJobs)}
            hint="Antrean, berjalan, atau jeda"
            tone="primary"
            icon={<Send className="size-5" />}
          />
          <LinkStat
            href="/admin/users"
            label="Operator"
            value={String(operators)}
            hint="Akun terdaftar"
            tone="neutral"
            icon={<Users className="size-5" />}
          />
          <LinkStat
            href="/admin/withdrawals"
            label="Penarikan tertunda"
            value={String(pendingWithdrawals)}
            hint={formatMoney(
              toMoneyString(pendingAmount._sum.netAmount?.toString() ?? "0"),
              currency,
            )}
            tone="success"
            icon={<Wallet className="size-5" />}
          />
        </Stagger>

        {reconciliation > 0 ? (
          <SectionCard
            title="Perlu rekonsiliasi"
            description={`${reconciliation} recipient${
              reconciliation === 1 ? "" : "s"
            } had an ambiguous delivery result. These are never retried automatically and need a manual decision.`}
            icon={<ShieldAlert className="size-5" />}
            tone="warning"
            actions={
              <Button asChild size="sm" variant="outline">
                <Link href="/admin/jobs">
                  <ClipboardList aria-hidden="true" />
                  Tinjau pekerjaan
                </Link>
              </Button>
            }
          >
            <p className="text-sm font-bold leading-snug text-foreground">
              Delivery yang ambigu tetap berada di{" "}
              <span className="border-2 border-black bg-warning px-1.5 py-0.5 font-black uppercase text-warning-foreground">
                RECONCILIATION_REQUIRED
              </span>{" "}
              sampai admin mengonfirmasi atau menghapusnya. Tidak ada pembayaran
              dan pesan tidak dikirim ulang dalam status ini.
            </p>
          </SectionCard>
        ) : null}
      </PageSections>
    </>
  );
}

/** Metric tile that navigates to the matching admin section. */
function LinkStat({
  href,
  label,
  value,
  hint,
  icon,
  tone,
}: {
  href: string;
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  tone: IconTileTone;
}) {
  return (
    <StaggerItem>
      <Link
        href={href}
        className="group block h-full focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Card hover className="h-full">
          <CardContent className="flex items-start justify-between gap-3 p-4 pt-4 sm:p-5 sm:pt-5">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-widest text-foreground">
                {label}
              </p>
              <p className="mt-2 truncate text-2xl font-black leading-none tracking-tighter sm:text-[1.75rem]">
                {value}
              </p>
              {hint ? (
                <p className="mt-1.5 flex items-center gap-1 truncate text-xs font-bold uppercase text-foreground">
                  {hint}
                  <ArrowRight
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-primary transition-transform duration-100 [transition-timing-function:steps(2,end)] group-hover:translate-x-0.5"
                  />
                </p>
              ) : null}
            </div>
            <IconTile tone={tone}>{icon}</IconTile>
          </CardContent>
        </Card>
      </Link>
    </StaggerItem>
  );
}
