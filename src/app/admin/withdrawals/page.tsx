import type { Metadata } from "next";
import {
  BanknoteArrowUp,
  Coins,
  Landmark,
  Receipt,
  Scissors,
  UserCog,
  Wallet,
} from "lucide-react";

import { requireAdmin } from "@/lib/auth/session";
import {
  listWalletChangeRequests,
  listWithdrawalsForAdmin,
} from "@/lib/admin/queries";
import { formatMoney } from "@/lib/money";
import { IconTile } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import {
  EmptyState,
  PageHeader,
  PageSections,
  SectionCard,
} from "@/components/ui/page";
import { WithdrawalReviewControls } from "@/components/admin/withdrawal-review-controls";
import { WalletRequestReviewControls } from "@/components/admin/wallet-request-review-controls";

export const metadata: Metadata = { title: "Withdrawals" };

const STATUS_VARIANT: Record<
  string,
  "success" | "warning" | "danger" | "info" | "neutral"
> = {
  PENDING: "warning",
  PROCESSING: "info",
  APPROVED: "info",
  PAID: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

/**
 * Withdrawal and wallet-change review queue.
 *
 * Every decision is applied through the withdrawal/wallet services, which append
 * immutable ledger entries and audit records (RULES.md §15, §16).
 */
export default async function AdminWithdrawalsPage() {
  await requireAdmin();

  const [{ withdrawals, total }, walletRequests] = await Promise.all([
    listWithdrawalsForAdmin({ pageSize: 50 }),
    listWalletChangeRequests(),
  ]);

  const pending = withdrawals.filter((row) => row.status === "PENDING").length;

  return (
    <>
      <PageHeader
        icon={<Wallet className="size-5" />}
        tone="success"
        title="Withdrawals"
        description="Account numbers are shown masked; full details are never rendered."
        actions={
          <>
            <Badge variant={pending > 0 ? "warning" : "neutral"}>
              {pending} pending
            </Badge>
            <Badge variant="info">{total} total</Badge>
          </>
        }
      />

      <PageSections>
        {walletRequests.length > 0 ? (
          <SectionCard
            title="Wallet change requests"
            description="Withdrawals stay paused for these operators until a decision is recorded."
            icon={<Landmark className="size-5" />}
            tone="warning"
            actions={<Badge variant="warning">{walletRequests.length}</Badge>}
          >
            <Stagger className="space-y-3">
              {walletRequests.map((request) => (
                <StaggerItem key={request.id}>
                  <div className="flex flex-col gap-3 border-4 border-black bg-warning p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <IconTile tone="warning" className="size-9 shrink-0">
                        <UserCog className="size-4" />
                      </IconTile>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black uppercase text-warning-foreground">
                          {request.userEmail}
                        </p>
                        <p className="mt-0.5 truncate text-xs font-bold text-warning-foreground">
                          New: {request.providerName} · {request.accountMasked} ·{" "}
                          {request.createdAt.toISOString().slice(0, 10)}
                        </p>
                      </div>
                    </div>
                    <WalletRequestReviewControls changeRequestId={request.id} />
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </SectionCard>
        ) : null}

        <SectionCard
          title="Requests"
          description="Oldest first. Rejecting releases the held balance back to the operator."
          icon={<BanknoteArrowUp className="size-5" />}
        >
          {withdrawals.length === 0 ? (
            <EmptyState
              icon={<Wallet className="size-6" />}
              title="No withdrawal requests"
              description="Payout requests submitted by operators land in this queue."
            />
          ) : (
            <Stagger className="space-y-3">
              {withdrawals.map((row) => (
                <StaggerItem key={row.id}>
                  <div className="border-4 border-black bg-surface p-4 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-accent">
                    <div className="flex flex-wrap items-start gap-3">
                      <IconTile
                        tone={
                          row.status === "PAID"
                            ? "success"
                            : row.status === "REJECTED"
                              ? "danger"
                              : "warning"
                        }
                        className="size-9 shrink-0"
                      >
                        <Receipt className="size-4" />
                      </IconTile>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black uppercase text-foreground">
                          {row.userName || row.userEmail}
                        </p>
                        <p className="mt-0.5 truncate text-xs font-bold text-foreground">
                          {row.userEmail} · {row.providerName} ·{" "}
                          {row.accountMasked}
                        </p>
                      </div>
                      <Badge variant={STATUS_VARIANT[row.status] ?? "neutral"}>
                        {row.status}
                      </Badge>
                    </div>

                    <dl className="mt-4 grid grid-cols-1 gap-3 min-[480px]:grid-cols-3">
                      <Amount
                        label="Gross"
                        value={formatMoney(row.amount, row.currency)}
                        icon={<Coins className="size-3.5 text-info" />}
                      />
                      <Amount
                        label="Fee"
                        value={formatMoney(row.fee, row.currency)}
                        icon={<Scissors className="size-3.5 text-warning" />}
                      />
                      <Amount
                        label="Net payout"
                        value={formatMoney(row.netAmount, row.currency)}
                        icon={
                          <BanknoteArrowUp className="size-3.5 text-success" />
                        }
                        emphasise
                      />
                    </dl>

                    <div className="mt-4 border-t-4 border-black pt-4">
                      <WithdrawalReviewControls
                        withdrawalId={row.id}
                        status={row.status}
                      />
                    </div>
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

/** Money cell inside a withdrawal row. Values are pre-formatted Decimal strings. */
function Amount({
  label,
  value,
  icon,
  emphasise,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  emphasise?: boolean;
}) {
  return (
    <div className="border-4 border-black bg-card p-3">
      <dt className="flex items-center gap-1.5 text-[0.6875rem] font-black uppercase tracking-widest text-foreground">
        <span aria-hidden="true">{icon}</span>
        {label}
      </dt>
      <dd
        className={
          emphasise
            ? "mt-1 text-sm font-black leading-none tracking-tight text-success"
            : "mt-1 text-sm font-black leading-none tracking-tight text-foreground"
        }
      >
        {value}
      </dd>
    </div>
  );
}
