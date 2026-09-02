import type { Metadata } from "next";
import {
  ArrowDownToLine,
  BanknoteArrowUp,
  Coins,
  History,
  Landmark,
  Lock,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { requireUser } from "@/lib/auth/session";
import { getWalletView } from "@/lib/wallet/service";
import { listRecentEarnings, listUserWithdrawals } from "@/lib/wallet/queries";
import { getBalance } from "@/lib/ledger/service";
import { getSetting } from "@/lib/settings/service";
import { SETTING_KEYS } from "@/lib/constants";
import { formatMoney } from "@/lib/money";
import { PAYOUT_PROVIDERS } from "@/lib/validation/wallet";
import { Badge } from "@/components/ui/badge";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import {
  EmptyState,
  PageHeader,
  PageSections,
  SectionCard,
  StatCard,
  StatGrid,
} from "@/components/ui/page";
import { WalletForm } from "@/components/wallet/wallet-form";
import { WithdrawalForm } from "@/components/wallet/withdrawal-form";
import { CancelWithdrawalButton } from "@/components/wallet/cancel-withdrawal-button";

export const metadata: Metadata = { title: "Earnings" };

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
 * Earnings, wallet and withdrawals for the signed-in operator.
 *
 * Balances come from the ledger and wallet details are masked by the service
 * layer (RULES.md §14, §15).
 */
export default async function WalletPage() {
  const actor = await requireUser();

  const [currency, withdrawalsEnabled, minAmount, fee] = await Promise.all([
    getSetting(SETTING_KEYS.defaultCurrency),
    getSetting(SETTING_KEYS.withdrawalsEnabled),
    getSetting(SETTING_KEYS.minWithdrawalAmount),
    getSetting(SETTING_KEYS.withdrawalFee),
  ]);

  const [wallet, balance, earnings, withdrawals] = await Promise.all([
    getWalletView(actor.id),
    getBalance(actor.id, currency),
    listRecentEarnings({ userId: actor.id, limit: 20 }),
    listUserWithdrawals({ userId: actor.id, limit: 20 }),
  ]);

  const hasOpenWithdrawal = withdrawals.some((row) =>
    ["PENDING", "PROCESSING", "APPROVED"].includes(row.status),
  );

  const withdrawalBlockedReason = !withdrawalsEnabled
    ? "Withdrawals are temporarily unavailable."
    : !wallet
      ? "Set your payout wallet before requesting a withdrawal."
      : wallet.status !== "ACTIVE"
        ? "Your wallet is under review. Withdrawals resume once it is approved."
        : hasOpenWithdrawal
          ? "You already have a withdrawal in progress."
          : undefined;

  return (
    <>
      <PageHeader
        icon={<Wallet className="size-5" />}
        tone="success"
        title="Earnings"
        description="Earnings are credited only after a delivery is confirmed as sent."
      />

      <PageSections>
        <StatGrid className="xl:grid-cols-3">
          <StatCard
            label="Available"
            tone="success"
            value={formatMoney(balance.available, currency)}
            hint="Ready to withdraw"
            icon={<Coins className="size-5" />}
          />
          <StatCard
            label="On hold"
            tone="warning"
            value={formatMoney(balance.held, currency)}
            hint="Reserved for open withdrawals"
            icon={<Lock className="size-5" />}
          />
          <StatCard
            label="Lifetime total"
            tone="info"
            value={formatMoney(balance.total, currency)}
            hint="All confirmed credits"
            icon={<TrendingUp className="size-5" />}
          />
        </StatGrid>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SectionCard
            title="Payout wallet"
            description={
              wallet
                ? `${wallet.providerName} · ${wallet.accountNumberMasked}`
                : "No wallet set yet."
            }
            icon={<Landmark className="size-5" />}
            tone="info"
            actions={
              wallet ? (
                <>
                  <Badge
                    variant={wallet.status === "ACTIVE" ? "success" : "warning"}
                  >
                    {wallet.status}
                  </Badge>
                  {wallet.hasPendingChange ? (
                    <Badge variant="info">Change pending</Badge>
                  ) : null}
                </>
              ) : undefined
            }
          >
            <WalletForm
              providers={PAYOUT_PROVIDERS.map((provider) => ({
                code: provider.code,
                name: provider.name,
              }))}
              isChange={Boolean(wallet)}
              disabled={Boolean(wallet?.hasPendingChange)}
              disabledReason="A change request is already awaiting review."
            />
          </SectionCard>

          <SectionCard
            title="Request a withdrawal"
            description="Funds are held as soon as the request is created."
            icon={<BanknoteArrowUp className="size-5" />}
            tone="success"
          >
            <WithdrawalForm
              availableLabel={formatMoney(balance.available, currency)}
              minAmountLabel={formatMoney(minAmount, currency)}
              feeLabel={formatMoney(fee, currency)}
              disabled={Boolean(withdrawalBlockedReason)}
              disabledReason={withdrawalBlockedReason}
            />
          </SectionCard>
        </div>

        <SectionCard
          title="Withdrawal history"
          description="Account numbers are always shown masked."
          icon={<History className="size-5" />}
          tone="warning"
        >
          {withdrawals.length === 0 ? (
            <EmptyState
              icon={<ArrowDownToLine className="size-6" />}
              title="No withdrawal requests yet"
              description="Once you request a payout it will be listed here with its review status."
            />
          ) : (
            <Stagger className="space-y-3">
              {withdrawals.map((row) => (
                <StaggerItem key={row.id}>
                  <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface/60 p-4 transition-colors hover:border-primary/35 hover:bg-surface sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {formatMoney(row.netAmount, row.currency)}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          net of {formatMoney(row.fee, row.currency)} fee
                        </span>
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {row.providerName} · {row.accountMasked} ·{" "}
                        {row.createdAt.toISOString().slice(0, 10)}
                      </p>
                      {row.rejectionReason ? (
                        <p className="mt-1.5 text-xs font-medium text-destructive">
                          {row.rejectionReason}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={STATUS_VARIANT[row.status] ?? "neutral"}>
                        {row.status}
                      </Badge>
                      {row.cancellable ? (
                        <CancelWithdrawalButton withdrawalId={row.id} />
                      ) : null}
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </SectionCard>

        <SectionCard
          title="Recent earnings"
          description="Each row is one confirmed delivery credit."
          icon={<Coins className="size-5" />}
          tone="success"
        >
          {earnings.length === 0 ? (
            <EmptyState
              icon={<Coins className="size-6" />}
              title="No earnings yet"
              description="Run a blast job on an assigned campaign to start earning."
            />
          ) : (
            <Stagger className="space-y-2">
              {earnings.map((row) => (
                <StaggerItem key={row.id}>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface/60 px-4 py-3 transition-colors hover:border-success/35 hover:bg-surface">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {row.campaignName ?? "Campaign"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {row.createdAt
                          .toISOString()
                          .slice(0, 16)
                          .replace("T", " ")}{" "}
                        UTC
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-bold text-success">
                      +{formatMoney(row.amount, row.currency)}
                    </span>
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
