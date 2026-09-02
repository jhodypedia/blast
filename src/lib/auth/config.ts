import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js configuration.
 *
 * This file is imported by `proxy.ts` (middleware), so it must not pull in
 * Prisma, Redis, bcrypt or any Node-only module. Providers that need those live
 * in `src/lib/auth/index.ts`.
 */
export const authRoutes = {
  signIn: "/login",
  register: "/register",
  adminRoot: "/admin",
  userRoot: "/dashboard",
} as const;

/** Route prefixes reachable without a session. */
const PUBLIC_PREFIXES = [
  "/",
  "/login",
  "/register",
  "/legal",
  "/api/auth",
  "/api/health",
] as const;

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/") {
    return true;
  }
  return PUBLIC_PREFIXES.some(
    (prefix) => prefix !== "/" && (pathname === prefix || pathname.startsWith(`${prefix}/`)),
  );
}

export function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/**
 * True only when the session reports a status that is definitely not ACTIVE.
 *
 * `undefined` deliberately returns `false`. The edge gate can only report what
 * the JWT carries, so treating a missing claim as "suspended" would lock every
 * account out of every page if the token projection ever regressed. The
 * authoritative status check runs server-side in `requireActor()` and in the
 * `/admin` and `/dashboard` layouts, which read the database-backed session.
 */
export function isExplicitlySuspended(status: string | undefined): boolean {
  return status !== undefined && status !== "ACTIVE";
}

/**
 * True only when the session reports a role that is definitely not ADMIN.
 *
 * Same fail-open reasoning as `isExplicitlySuspended`: an unknown role is
 * passed through to the server layout rather than redirected in the edge.
 */
export function isExplicitlyNonAdmin(role: string | undefined): boolean {
  return role !== undefined && role !== "ADMIN";
}

export const authConfig = {
  // Providers are attached in the Node-only config; middleware needs none.
  providers: [],
  pages: {
    signIn: authRoutes.signIn,
    error: authRoutes.signIn,
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 8,
    updateAge: 60 * 15,
  },
  trustHost: true,
  callbacks: {
    /**
     * Projects the JWT claims onto the session object.
     *
     * This lives in the edge-safe config on purpose: `proxy.ts` creates its own
     * NextAuth instance from this object, and without this callback
     * `session.user.role` / `session.user.status` would be `undefined` there —
     * making every authenticated request look suspended. It only reads decoded
     * token claims, so it needs no Prisma and runs in the edge runtime.
     */
    session({ session, token }) {
      if (token.uid) {
        session.user.id = token.uid;
        session.user.role = token.role;
        session.user.status = token.status;
      }
      return session;
    },

    /**
     * Coarse gate used by middleware. Fine-grained ownership and role checks
     * are always repeated in server actions, route handlers and services.
     */
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;

      if (isPublicPath(pathname)) {
        return true;
      }

      const user = auth?.user;
      if (!user) {
        return false;
      }
      if (isExplicitlySuspended(user.status)) {
        return false;
      }
      if (isAdminPath(pathname) && isExplicitlyNonAdmin(user.role)) {
        return false;
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
