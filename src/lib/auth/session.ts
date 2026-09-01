import "server-only";

import { forbidden, unauthenticated } from "@/lib/errors";
import { auth } from "@/lib/auth";

/**
 * Server-side session access and RBAC guards.
 *
 * Every server action, route handler and service entry point derives identity
 * from here. `userId` and `role` are never read from request bodies, query
 * strings or headers (RULES.md §8).
 */

export type SessionActor = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "USER";
  status: "ACTIVE" | "SUSPENDED";
};

/** Returns the current actor, or `null` when unauthenticated. */
export async function currentActor(): Promise<SessionActor | null> {
  const session = await auth();
  const user = session?.user;

  if (!user?.id || !user.email) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name ?? "",
    role: user.role,
    status: user.status,
  };
}

/** Requires any authenticated, active account. */
export async function requireActor(): Promise<SessionActor> {
  const actor = await currentActor();
  if (!actor) {
    throw unauthenticated();
  }
  if (actor.status !== "ACTIVE") {
    throw forbidden("Your account is suspended.");
  }
  return actor;
}

/** Requires ADMIN. Used by every admin service and route. */
export async function requireAdmin(): Promise<SessionActor> {
  const actor = await requireActor();
  if (actor.role !== "ADMIN") {
    throw forbidden(
      "You do not have permission to perform this action.",
      `Actor ${actor.id} with role ${actor.role} attempted an ADMIN-only operation`,
    );
  }
  return actor;
}

/**
 * Requires USER. ADMIN is deliberately rejected so admin accounts cannot
 * accumulate balances or run blast jobs through user-only endpoints.
 */
export async function requireUser(): Promise<SessionActor> {
  const actor = await requireActor();
  if (actor.role !== "USER") {
    throw forbidden(
      "This action is only available to operator accounts.",
      `Actor ${actor.id} with role ${actor.role} attempted a USER-only operation`,
    );
  }
  return actor;
}

/** Asserts the actor owns `ownerId`, or is an ADMIN acting administratively. */
export function assertOwnership(
  actor: SessionActor,
  ownerId: string,
  resource: string,
): void {
  if (actor.role === "ADMIN") {
    return;
  }
  if (actor.id !== ownerId) {
    throw forbidden(
      "You do not have permission to access this resource.",
      `Actor ${actor.id} attempted to access ${resource} owned by ${ownerId}`,
    );
  }
}
