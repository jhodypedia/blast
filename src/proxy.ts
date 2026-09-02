/**
 * Next.js 16 renamed `middleware.ts` to `proxy.ts`.
 *
 * This is the coarse RBAC gate: unauthenticated visitors are redirected to the
 * login page, suspended accounts are signed out, and USER accounts are kept out
 * of `/admin`. It is a UX / defence-in-depth layer only — every server action,
 * route handler and service repeats the authorization checks (RULES.md §5).
 *
 * The gate fails *open* on unknown role/status. Middleware runs on the edge and
 * can only see the claims present in the JWT; if that projection ever breaks,
 * treating a missing claim as "suspended" would redirect every signed-in user
 * away from every page. The authoritative checks live in `requireActor()` /
 * `requireAdmin()` and in the `/admin` and `/dashboard` layouts.
 */
import NextAuth from "next-auth";

import {
  authConfig,
  authRoutes,
  isAdminPath,
  isExplicitlyNonAdmin,
  isExplicitlySuspended,
  isPublicPath,
} from "@/lib/auth/config";

const { auth } = NextAuth(authConfig);

export default auth((request) => {
  const { pathname, search } = request.nextUrl;
  const user = request.auth?.user;

  // Signed-in users should not sit on the auth screens. When the role claim is
  // missing, hand off to `/` which resolves the destination server-side.
  if (user && (pathname === authRoutes.signIn || pathname === authRoutes.register)) {
    const target =
      user.role === "ADMIN"
        ? authRoutes.adminRoot
        : user.role === "USER"
          ? authRoutes.userRoot
          : "/";
    return Response.redirect(new URL(target, request.nextUrl.origin));
  }

  if (isPublicPath(pathname)) {
    return undefined;
  }

  if (!user) {
    const loginUrl = new URL(authRoutes.signIn, request.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
    return Response.redirect(loginUrl);
  }

  if (isExplicitlySuspended(user.status)) {
    const loginUrl = new URL(authRoutes.signIn, request.nextUrl.origin);
    loginUrl.searchParams.set("error", "AccountSuspended");
    return Response.redirect(loginUrl);
  }

  if (isAdminPath(pathname) && isExplicitlyNonAdmin(user.role)) {
    return Response.redirect(new URL(authRoutes.userRoot, request.nextUrl.origin));
  }

  return undefined;
});

export const config = {
  // Skip static assets and image optimisation; everything else passes through.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
