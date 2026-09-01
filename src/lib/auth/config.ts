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
      if (user.status !== "ACTIVE") {
        return false;
      }
      if (isAdminPath(pathname)) {
        return user.role === "ADMIN";
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
