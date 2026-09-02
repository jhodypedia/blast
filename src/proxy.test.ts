import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Proxy (middleware) RBAC gate.
 *
 * `NextAuth()` is stubbed so the exported default is the bare handler and the
 * decision logic can be exercised without an edge runtime or a real session.
 */
vi.mock("next-auth", () => ({
  default: () => ({
    auth: (handler: unknown) => handler,
  }),
}));

type SessionUser = {
  id?: string;
  role?: string;
  status?: string;
};

type ProxyHandler = (request: {
  nextUrl: URL;
  auth: { user?: SessionUser } | null;
}) => Response | undefined;

let handler: ProxyHandler;

beforeEach(async () => {
  vi.resetModules();
  // `auth()` is typed as a Next route handler (it accepts a second context
  // argument), while the stub above hands back the bare decision function. The
  // two signatures do not overlap, so the cast has to go through `unknown`.
  const mod = (await import("@/proxy")) as unknown as {
    default: ProxyHandler;
  };
  handler = mod.default;
});

function visit(path: string, user?: SessionUser): Response | undefined {
  return handler({
    nextUrl: new URL(path, "http://localhost:3000"),
    auth: user ? { user } : null,
  });
}

function locationOf(response: Response | undefined): string | null {
  return response?.headers.get("location") ?? null;
}

describe("proxy gate", () => {
  it("lets an active admin through to /admin", () => {
    expect(visit("/admin", { role: "ADMIN", status: "ACTIVE" })).toBeUndefined();
  });

  it("lets an active operator through to /dashboard", () => {
    expect(visit("/dashboard", { role: "USER", status: "ACTIVE" })).toBeUndefined();
  });

  it("does not redirect a session with missing claims as suspended", () => {
    // Regression: the edge instance had no session callback, so `status` was
    // `undefined` for everyone and this produced
    // `/login?error=AccountSuspended` on every guarded route.
    expect(visit("/dashboard", { id: "clh1user0001" })).toBeUndefined();
    expect(visit("/admin", { id: "clh1user0001" })).toBeUndefined();
  });

  it("redirects an explicitly suspended account to the login screen", () => {
    const location = locationOf(
      visit("/dashboard", { role: "USER", status: "SUSPENDED" }),
    );

    expect(location).toBe("http://localhost:3000/login?error=AccountSuspended");
  });

  it("sends an anonymous visitor to login with a callback url", () => {
    const location = locationOf(visit("/dashboard/devices?tab=qr"));

    expect(location).toBe(
      "http://localhost:3000/login?callbackUrl=%2Fdashboard%2Fdevices%3Ftab%3Dqr",
    );
  });

  it("bounces a USER away from /admin to their own dashboard", () => {
    const location = locationOf(
      visit("/admin/users", { role: "USER", status: "ACTIVE" }),
    );

    expect(location).toBe("http://localhost:3000/dashboard");
  });

  it("moves a signed-in admin off the login screen", () => {
    const location = locationOf(visit("/login", { role: "ADMIN", status: "ACTIVE" }));

    expect(location).toBe("http://localhost:3000/admin");
  });

  it("moves a signed-in operator off the register screen", () => {
    const location = locationOf(
      visit("/register", { role: "USER", status: "ACTIVE" }),
    );

    expect(location).toBe("http://localhost:3000/dashboard");
  });

  it("routes a signed-in session with no role claim through the root resolver", () => {
    const location = locationOf(visit("/login", { id: "clh1user0001" }));

    expect(location).toBe("http://localhost:3000/");
  });

  it("leaves public paths alone", () => {
    for (const path of ["/", "/legal/terms", "/api/auth/session", "/api/health"]) {
      expect(visit(path)).toBeUndefined();
    }
  });
});
