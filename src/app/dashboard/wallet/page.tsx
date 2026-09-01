import type { Metadata } from "next";
import { Wallet } from "lucide-react";

import { requireUser } from "@/lib/auth/session";
import { getWalletView } from "@/lib/wallet/service";
import { listRecentEarnings, listUserWithdrawals } from "@/lib/wallet/queries";
import { getBalance } from "@/lib/ledger/service";
import { getSetting } from "@/lib/settings/service";
import { SETTING_KEYS } from "@/lib/constants";
import { formatMoney } from "@/lib/money";
import { PAYOUT_PROVIDERS } from "@/lib/validation/wallet";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 truncate text-xl font-semibold">{value}</p>
        </div>
        <span className="shrink-0 rounded-lg bg-muted p-2">
          <Wallet className="size-5 text-success" aria-hidden="true" />
        </span>
      </CardContent>
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-6 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

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
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Earnings</h1>
        <p className="text-sm text-muted-foreground">
          Earnings are credited only after a delivery is confirmed as sent.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Available"
          value={formatMoney(balance.available, currency)}
        />
        <SummaryCard
          label="On hold"
          value={formatMoney(balance.held, currency)}
        />
        <SummaryCard
          label="Lifetime total"
          value={formatMoney(balance.total, currency)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Payout wallet</CardTitle>
            <CardDescription>
              {wallet
                ? `${wallet.providerName} · ${wallet.accountNumberMasked}`
                : "No wallet set yet."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {wallet ? (
              <div className="flex items-center gap-2">
                <Badge
                  variant={wallet.status === "ACTIVE" ? "success" : "warning"}
                >
                  {wallet.status}
                </Badge>
                {wallet.hasPendingChange ? (
                  <Badge variant="info">Change pending review</Badge>
                ) : null}
              </div>
            ) : null}

            <WalletForm
              providers={PAYOUT_PROVIDERS.map((provider) => ({
                code: provider.code,
                name: provider.name,
              }))}
              isChange={Boolean(wallet)}
              disabled={Boolean(wallet?.hasPendingChange)}
              disabledReason="A change request is already awaiting review."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Request a withdrawal</CardTitle>
            <CardDescription>
              Funds are held as soon as the request is created.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WithdrawalForm
              availableLabel={formatMoney(balance.available, currency)}
              minAmountLabel={formatMoney(minAmount, currency)}
              feeLabel={formatMoney(fee, currency)}
              disabled={Boolean(withdrawalBlockedReason)}
              disabledReason={withdrawalBlockedReason}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Withdrawal history</CardTitle>
          <CardDescription>
            Account numbers are always shown masked.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {withdrawals.length === 0 ? (
            <EmptyState message="No withdrawal requests yet." />
          ) : (
            withdrawals.map((row) => (
              <div
                key={row.id}
                className="flex flex-col gap-2 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {formatMoney(row.netAmount, row.currency)}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      net of {formatMoney(row.fee, row.currency)} fee
                    </span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.providerName} · {row.accountMasked} ·{" "}
                    {row.createdAt.toISOString().slice(0, 10)}
                  </p>
                  {row.rejectionReason ? (
                    <p className="mt-1 text-xs text-destructive">
                      {row.rejectionReason}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_VARIANT[row.status] ?? "neutral"}>
                    {row.status}
                  </Badge>
                  {row.cancellable ? (
                    <CancelWithdrawalButton withdrawalId={row.id} />
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent earnings</CardTitle>
          <CardDescription>
            Each row is one confirmed delivery credit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {earnings.length === 0 ? (
            <EmptyState message="No earnings yet. Run a blast job to start earning." />
          ) : (
            earnings.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {row.campaignName ?? "Campaign"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.createdAt.toISOString().slice(0, 16).replace("T", " ")}{" "}
                    UTC
                  </p>
                </div>
                <span className="text-sm font-semibold text-success">
                  +{formatMoney(row.amount, row.currency)}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
