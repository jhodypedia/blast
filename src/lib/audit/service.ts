import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { PrismaTransactionClient } from "@/lib/db/prisma";
import { hashForLogging } from "@/lib/security/crypto";
import { logger } from "@/lib/observability/logger";

/**
 * Immutable audit trail for sensitive admin operations (RULES.md §16).
 *
 * Summaries must be pre-sanitised by the caller: never pass raw phone numbers,
 * credentials, wallet numbers or password material.
 */

export type AuditAction =
  | "USER_CREATE"
  | "USER_UPDATE"
  | "USER_SUSPEND"
  | "USER_REACTIVATE"
  | "USER_FORCE_LOGOUT"
  | "DEVICE_FORCE_DISCONNECT"
  | "TARGET_LIST_UPLOAD"
  | "TARGET_LIST_ARCHIVE"
  | "TARGET_LIST_EXPORT_INVALID"
  | "CAMPAIGN_CREATE"
  | "CAMPAIGN_UPDATE"
  | "CAMPAIGN_TRANSITION"
  | "CAMPAIGN_ASSIGNMENT_UPDATE"
  | "BLAST_JOB_FORCE_STOP"
  | "RECIPIENT_ADMIN_RETRY"
  | "RECONCILIATION_RESOLVE"
  | "LEDGER_ADJUSTMENT"
  | "WALLET_CHANGE_REVIEW"
  | "WITHDRAWAL_APPROVE"
  | "WITHDRAWAL_REJECT"
  | "WITHDRAWAL_PROCESS"
  | "WITHDRAWAL_MARK_PAID"
  | "SETTING_UPDATE";

export type AuditResourceType =
  | "USER"
  | "DEVICE"
  | "TARGET_LIST"
  | "CAMPAIGN"
  | "BLAST_JOB"
  | "CAMPAIGN_RECIPIENT"
  | "LEDGER_ENTRY"
  | "WALLET"
  | "WITHDRAWAL"
  | "SETTING";

export type AuditInput = {
  actorUserId: string | null;
  actorRole: "ADMIN" | "USER" | "SYSTEM";
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId?: string;
  beforeSummary?: Record<string, unknown>;
  afterSummary?: Record<string, unknown>;
  reason?: string;
  /** Raw IP; hashed before storage. */
  ip?: string;
};

/**
 * Records an audit entry. Pass `tx` when the audit must be atomic with the
 * operation it describes (money movement, state transitions).
 */
export async function recordAudit(
  input: AuditInput,
  tx?: PrismaTransactionClient,
): Promise<void> {
  const client = tx ?? prisma;

  await client.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      beforeSummary: (input.beforeSummary ?? null) as never,
      afterSummary: (input.afterSummary ?? null) as never,
      reason: input.reason ?? null,
      ipHash: input.ip ? hashForLogging(input.ip) : null,
    },
  });

  logger("security").info(
    {
      event: "audit",
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      actorUserId: input.actorUserId,
    },
    "Admin action audited",
  );
}

export type SecurityEvent =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILURE"
  | "LOGIN_BLOCKED_SUSPENDED"
  | "LOGIN_RATE_LIMITED"
  | "REGISTER_SUCCESS"
  | "REGISTER_RATE_LIMITED"
  | "REGISTER_DISABLED"
  | "PASSWORD_CHANGED"
  | "TURNSTILE_FAILED"
  | "WITHDRAWAL_REQUESTED"
  | "WALLET_SET"
  | "SESSION_INVALIDATED";

/** Records a security-relevant event. Never stores credentials or tokens. */
export async function recordSecurityEvent(input: {
  userId?: string | null;
  event: SecurityEvent;
  outcome: "SUCCESS" | "FAILURE" | "BLOCKED";
  ip?: string;
  userAgent?: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  await prisma.securityLog.create({
    data: {
      userId: input.userId ?? null,
      event: input.event,
      outcome: input.outcome,
      ipHash: input.ip ? hashForLogging(input.ip) : null,
      userAgent: input.userAgent?.slice(0, 255) ?? null,
      detail: (input.detail ?? null) as never,
    },
  });
}
