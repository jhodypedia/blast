import { describe, expect, it } from "vitest";

import {
  authConfig,
  isAdminPath,
  isExplicitlyNonAdmin,
  isExplicitlySuspended,
  isPublicPath,
} from "@/lib/auth/config";

/**
 * Edge-safe auth configuration (RULES.md §5, §8).
 *
 * `proxy.ts` builds its own NextAuth instance from `authConfig`, so the token to
 * session projection has to live here. When it did not, `session.user.role` and
 * `session.user.status` were `undefined` inside middleware, the
 * `status !== "ACTIVE"` guard matched for everyone and every signed-in account
 * was redirected to `/login?error=AccountSuspended`. These tests pin both halves
 * of that fix: the projection exists, and the guards only fire on an explicit
 * non-ACTIVE / non-ADMIN value.
 */

type SessionUser = {
  id?: string;
  role?: string;
  status?: string;
  email?: string | null;
  name?: string | null;
};

const sessionCallback = authConfig.callbacks.session as unknown as (params: {
  session: { user: SessionUser; expires?: string };
  token: Record<string, unknown>;
}) => { user: SessionUser };

const authorizedCallback = authConfig.callbacks.authorized as unknown as (params: {
  auth: { user?: SessionUser } | null;
  request: { nextUrl: URL };
}) => boolean;

function authorize(pathname: string, user?: SessionUser): boolean {
  return authorizedCallback({
    auth: user ? { user } : null,
    request: { nextUrl: new URL(pathname, "http://localhost:3000") },
  });
}

describe("authConfig.callbacks.session", () => {
  it("is defined on the shared config so middleware sees enriched claims", () => {
    // Regression guard: moving this callback to the Node-only instance
    // reintroduces the total redirect loop.
    expect(typeof authConfig.callbacks.session).toBe("function");
  });

  it("projects uid, role and status from the token onto the session user", () => {
    const result = sessionCallback({
      session: { user: { email: "admin@example.test", name: "Admin" } },
      token: {
        uid: "clh1user0001",
        role: "ADMIN",
        status: "ACTIVE",
        epoch: 3,
      },
    });

    expect(result.user.id).toBe("clh1user0001");
    expect(result.user.role).toBe("ADMIN");
    expect(result.user.status).toBe("ACTIVE");
  });

  it("maps a USER token without widening the role", () => {
    const result = sessionCallback({
      session: { user: { email: "operator@example.test" } },
      token: { uid: "clh1user0002", role: "USER", status: "ACTIVE", epoch: 1 },
    });

    expect(result.user.role).toBe("USER");
  });

  it("carries a SUSPENDED status through instead of dropping it", () => {
    const result = sessionCallback({
      session: { user: { email: "suspended@example.test" } },
      token: { uid: "clh1user0003", role: "USER", status: "SUSPENDED", epoch: 1 },
    });

    expect(result.user.status).toBe("SUSPENDED");
  });

  it("leaves the session untouched when the token has no uid", () => {
    const result = sessionCallback({
      session: { user: { email: "anon@example.test" } },
      token: {},
    });

    expect(result.user.id).toBeUndefined();
    expect(result.user.role).toBeUndefined();
  });

  it("does not leak the session epoch to the client session", () => {
    const result = sessionCallback({
      session: { user: {} },
      token: { uid: "clh1user0004", role: "USER", status: "ACTIVE", epoch: 9 },
    });

    expect(result.user).not.toHaveProperty("epoch");
    expect(result.user).not.toHaveProperty("sessionEpoch");
  });
});

describe("status and role predicates", () => {
  it("treats an unknown status as not suspended", () => {
    // Fail open: the edge gate cannot see more than the JWT carries.
    expect(isExplicitlySuspended(undefined)).toBe(false);
  });

  it("treats ACTIVE as not suspended", () => {
    expect(isExplicitlySuspended("ACTIVE")).toBe(false);
  });

  it("treats any other concrete status as suspended", () => {
    expect(isExplicitlySuspended("SUSPENDED")).toBe(true);
    expect(isExplicitlySuspended("")).toBe(true);
  });

  it("treats an unknown role as not non-admin", () => {
    expect(isExplicitlyNonAdmin(undefined)).toBe(false);
  });

  it("treats USER as non-admin and ADMIN as admin", () => {
    expect(isExplicitlyNonAdmin("USER")).toBe(true);
    expect(isExplicitlyNonAdmin("ADMIN")).toBe(false);
  });
});

describe("authConfig.callbacks.authorized", () => {
  it("allows every public path without a session", () => {
    for (const pathname of ["/", "/login", "/register", "/api/auth/session"]) {
      expect(authorize(pathname)).toBe(true);
    }
  });

  it("rejects a guarded path without a session", () => {
    expect(authorize("/dashboard")).toBe(false);
    expect(authorize("/admin")).toBe(false);
  });

  it("allows an active admin into /admin", () => {
    expect(
      authorize("/admin/target-lists", { role: "ADMIN", status: "ACTIVE" }),
    ).toBe(true);
  });

  it("keeps a USER out of /admin", () => {
    expect(
      authorize("/admin/target-lists", { role: "USER", status: "ACTIVE" }),
    ).toBe(false);
  });

  it("rejects an explicitly suspended account", () => {
    expect(authorize("/dashboard", { role: "USER", status: "SUSPENDED" })).toBe(
      false,
    );
  });

  it("allows a session whose claims are missing rather than locking it out", () => {
    // The previous behaviour returned false here, which made every route
    // unreachable for every account.
    expect(authorize("/dashboard", { id: "clh1user0001" })).toBe(true);
    expect(authorize("/admin", { id: "clh1user0001" })).toBe(true);
  });
});

describe("path helpers", () => {
  it("recognises admin paths without matching lookalikes", () => {
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admin/users")).toBe(true);
    expect(isAdminPath("/administration")).toBe(false);
    expect(isAdminPath("/dashboard")).toBe(false);
  });

  it("does not treat guarded areas as public", () => {
    expect(isPublicPath("/dashboard")).toBe(false);
    expect(isPublicPath("/admin")).toBe(false);
    expect(isPublicPath("/loginner")).toBe(false);
  });
});
