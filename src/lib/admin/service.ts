import "server-only";

import { prisma } from "@/lib/db/prisma";
import { conflict, invalidState, notFound, validationError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit/service";
import { setSetting } from "@/lib/settings/service";
import { isSettingKey, type SettingKey } from "@/lib/settings/registry";
import { getBalance } from "@/lib/ledger/service";
import { logger } from "@/lib/observability/logger";
import type { UserActionInput } from "@/lib/validation/admin";

/**
 * Admin service: user management, settings writes and audit reads.
 *
 * Suspension and force-logout both bump `sessionEpoch`, which invalidates every
 * issued JWT for that user on the next request (RULES.md §8).
 */

export type AdminUserSummary = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "USER";
  status: "ACTIVE" | "SUSPENDED";
  deviceCount: number;
  activeJobCount: number;
  lastLoginAt: Date | null;
  createdAt: Date;
};

export async function listUsers(params?: {
  search?: string;
  status?: "ACTIVE" | "SUSPENDED";
  page?: number;
  pageSize?: number;
}): Promise<{ users: AdminUserSummary[]; total: number }> {
  const page = params?.page ?? 1;
  const pageSize = Math.min(params?.pageSize ?? 20, 100);

  const where = {
    deletedAt: null,
    ...(params?.status ? { status: params.status } : {}),
    ...(params?.search
      ? {
          OR: [
            { email: { contains: params.search } },
            { name: { contains: params.search } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        _count: { select: { devices: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  const activeJobs = await prisma.blastJob.groupBy({
    by: ["userId"],
    where: {
      userId: { in: rows.map((row) => row.id) },
      status: { in: ["PENDING", "QUEUED", "RUNNING", "PAUSED"] },
    },
    _count: { _all: true },
  });

  const activeByUser = new Map(
    activeJobs.map((row) => [row.userId, row._count._all]),
  );

  return {
    total,
    users: rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      status: row.status,
      deviceCount: row._count.devices,
      activeJobCount: activeByUser.get(row.id) ?? 0,
      lastLoginAt: row.lastLoginAt,
      createdAt: row.createdAt,
    })),
  };
}

/**
 * Applies a user-management action.
 *
 * `sessionEpoch` is incremented for suspension and force-logout so existing JWTs
 * stop validating immediately. Running blast jobs are stopped on suspension:
 * leaving them running would keep crediting a disabled account.
 */
export async function applyUserAction(params: {
  adminUserId: string;
  input: UserActionInput;
  ip?: string;
}): Promise<void> {
  const { input } = params;

  if (input.userId === params.adminUserId) {
    throw validationError("You cannot apply this action to your own account.", {
      userId: ["Choose a different account"],
    });
  }

  const user = await prisma.user.findFirst({
    where: { id: input.userId, deletedAt: null },
    select: { id: true, role: true, status: true, sessionEpoch: true },
  });

  if (!user) {
    throw notFound("This account no longer exists.");
  }

  if (input.action === "SUSPEND" && user.status === "SUSPENDED") {
    throw invalidState("This account is already suspended.");
  }
  if (input.action === "REACTIVATE" && user.status === "ACTIVE") {
    throw invalidState("This account is already active.");
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: user.id, sessionEpoch: user.sessionEpoch },
      data: {
        ...(input.action === "SUSPEND"
          ? { status: "SUSPENDED", suspendedAt: now }
          : {}),
        ...(input.action === "REACTIVATE"
          ? { status: "ACTIVE", suspendedAt: null }
          : {}),
        // Every action here revokes issued sessions.
        sessionEpoch: user.sessionEpoch + 1,
      },
    });

    if (updated.count !== 1) {
      throw conflict("This account was changed by someone else.");
    }

    if (input.action === "SUSPEND") {
      await tx.blastJob.updateMany({
        where: {
          userId: user.id,
          status: { in: ["PENDING", "QUEUED", "RUNNING", "PAUSED"] },
        },
        data: {
          status: "CANCELLED",
          requestedStopAt: now,
          finishedAt: now,
          stoppedByRole: "ADMIN",
          stopReason: "Account suspended",
        },
      });

      // PENDING/CLAIMED rows are safe to cancel; SENDING rows are deliberately
      // left alone so an in-flight send is never double-handled.
      await tx.campaignRecipient.updateMany({
        where: {
          blastJob: { userId: user.id },
          status: { in: ["PENDING", "CLAIMED", "RETRYABLE_FAILED"] },
        },
        data: {
          status: "CANCELLED",
          workerId: null,
          lockedAt: null,
          leaseExpiresAt: null,
        },
      });
    }

    await recordAudit(
      {
        actorUserId: params.adminUserId,
        actorRole: "ADMIN",
        action:
          input.action === "SUSPEND"
            ? "USER_SUSPEND"
            : input.action === "REACTIVATE"
              ? "USER_REACTIVATE"
              : "USER_FORCE_LOGOUT",
        resourceType: "USER",
        resourceId: user.id,
        beforeSummary: { status: user.status },
        afterSummary: {
          status:
            input.action === "SUSPEND"
              ? "SUSPENDED"
              : input.action === "REACTIVATE"
                ? "ACTIVE"
                : user.status,
        },
        reason: input.reason,
        ip: params.ip,
      },
      tx,
    );
  });

  logger("security").info(
    {
      event: "admin.user_action",
      action: input.action,
      targetUserId: user.id,
    },
    "Admin user action applied",
  );
}

/**
 * Writes one setting and audits the before/after value.
 *
 * The raw form value arrives as a JSON string; `setSetting` re-validates it
 * against the registry schema before it is persisted.
 */
export async function updateSetting(params: {
  adminUserId: string;
  key: string;
  rawJsonValue: string;
  ip?: string;
}): Promise<void> {
  if (!isSettingKey(params.key)) {
    throw validationError("Unknown setting.", { key: ["Unknown setting"] });
  }

  const key: SettingKey = params.key;

  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(params.rawJsonValue);
  } catch {
    throw validationError("The value must be valid JSON.", {
      value: ["Enter a valid JSON value"],
    });
  }

  const { previous, next } = await setSetting(key, parsedValue, params.adminUserId);

  await recordAudit({
    actorUserId: params.adminUserId,
    actorRole: "ADMIN",
    action: "SETTING_UPDATE",
    resourceType: "SETTING",
    resourceId: key,
    beforeSummary: { value: previous },
    afterSummary: { value: next },
    ip: params.ip,
  });
}

export type AdminUserDetail = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "USER";
  status: "ACTIVE" | "SUSPENDED";
  createdAt: Date;
  lastLoginAt: Date | null;
  balance: { available: string; held: string; total: string; currency: string };
  /** Masked wallet summary only; ciphertext never leaves the service layer. */
  wallet: {
    providerName: string;
    accountNumberLast4: string;
    status: "ACTIVE" | "PENDING_REVIEW" | "LOCKED";
  } | null;
};

export async function getUserDetail(
  userId: string,
  currency: string,
): Promise<AdminUserDetail> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      createdAt: true,
      lastLoginAt: true,
      wallet: {
        select: {
          providerName: true,
          accountNumberLast4: true,
          status: true,
        },
      },
    },
  });

  if (!user) {
    throw notFound("This account no longer exists.");
  }

  const balance = await getBalance(user.id, currency);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    balance: {
      available: balance.available,
      held: balance.held,
      total: balance.total,
      currency,
    },
    wallet: user.wallet
      ? {
          providerName: user.wallet.providerName,
          accountNumberLast4: user.wallet.accountNumberLast4,
          status: user.wallet.status,
        }
      : null,
  };
}

