import type { Metadata } from "next";
import { Wallet } from "lucide-react";

import { requireAdmin } from "@/lib/auth/session";
import {
  listWalletChangeRequests,
  listWithdrawalsForAdmin,
} from "@/lib/admin/queries";
import { formatMoney } from "@/lib/money";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Withdrawals</h1>
        <p className="text-sm text-muted-foreground">
          {total} request{total === 1 ? "" : "s"}. Account numbers are shown
          masked; full details are never rendered.
        </p>
      </header>

      {walletRequests.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Wallet change requests</CardTitle>
            <CardDescription>
              Withdrawals stay paused for these operators until a decision is
              recorded.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {walletRequests.map((request) => (
              <div
                key={request.id}
                className="flex flex-col gap-2 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {request.userEmail}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    New: {request.providerName} · {request.accountMasked} ·{" "}
                    {request.createdAt.toISOString().slice(0, 10)}
                  </p>
                </div>
                <WalletRequestReviewControls changeRequestId={request.id} />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Requests</CardTitle>
          <CardDescription>
            Oldest first. Rejecting releases the held balance back to the
            operator.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {withdrawals.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <span className="rounded-full bg-muted p-3">
                <Wallet
                  className="size-6 text-muted-foreground"
                  aria-hidden="true"
                />
              </span>
              <p className="text-sm text-muted-foreground">
                No withdrawal requests.
              </p>
            </div>
          ) : (
            withdrawals.map((row) => (
              <div
                key={row.id}
                className="space-y-3 rounded-lg border border-border p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {row.userName || row.userEmail}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.userEmail} · {row.providerName} · {row.accountMasked}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANT[row.status] ?? "neutral"}>
                    {row.status}
                  </Badge>
                </div>

                <dl className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Gross</dt>
                    <dd className="font-semibold">
                      {formatMoney(row.amount, row.currency)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Fee</dt>
                    <dd className="font-medium">
                      {formatMoney(row.fee, row.currency)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Net payout</dt>
                    <dd className="font-semibold text-success">
                      {formatMoney(row.netAmount, row.currency)}
                    </dd>
                  </div>
                </dl>

                <WithdrawalReviewControls
                  withdrawalId={row.id}
                  status={row.status}
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
