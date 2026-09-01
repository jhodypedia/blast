/**
 * Withdrawal state machine (RULES.md §15).
 *
 * Kept free of database and I/O imports so the transition rules can be unit
 * tested directly and reused by both the service and the admin UI.
 */

export type ReviewAction =
  | "APPROVE"
  | "PROCESS"
  | "MARK_PAID"
  | "REJECT"
  | "CANCEL";

export type WithdrawalStatus =
  | "PENDING"
  | "PROCESSING"
  | "APPROVED"
  | "PAID"
  | "REJECTED"
  | "CANCELLED";

/** Statuses each decision may legally move from. */
export const REVIEWABLE_FROM: Record<ReviewAction, readonly WithdrawalStatus[]> =
  {
    APPROVE: ["PENDING", "PROCESSING"],
    PROCESS: ["PENDING", "APPROVED"],
    MARK_PAID: ["APPROVED", "PROCESSING"],
    REJECT: ["PENDING", "PROCESSING", "APPROVED"],
    // A USER may only cancel while the request is still untouched.
    CANCEL: ["PENDING"],
  };

export const NEXT_STATUS: Record<ReviewAction, WithdrawalStatus> = {
  APPROVE: "APPROVED",
  PROCESS: "PROCESSING",
  MARK_PAID: "PAID",
  REJECT: "REJECTED",
  CANCEL: "CANCELLED",
};

/** Rejection and cancellation both release the hold back to the operator. */
export function releasesFunds(action: ReviewAction): boolean {
  return action === "REJECT" || action === "CANCEL";
}

export function canReview(
  action: ReviewAction,
  status: WithdrawalStatus,
): boolean {
  return REVIEWABLE_FROM[action].includes(status);
}

/** Terminal states: no further decision is possible. */
export function isTerminal(status: WithdrawalStatus): boolean {
  return status === "PAID" || status === "REJECTED" || status === "CANCELLED";
}
