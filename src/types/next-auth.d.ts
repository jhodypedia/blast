import type { DefaultSession } from "next-auth";

/**
 * Session/JWT augmentation.
 *
 * `role` and `sessionEpoch` are written by the server-side JWT callback from
 * database state only. Client-supplied values are never trusted (RULES.md §5).
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "USER";
      status: "ACTIVE" | "SUSPENDED";
    } & DefaultSession["user"];
  }

  interface User {
    role: "ADMIN" | "USER";
    status: "ACTIVE" | "SUSPENDED";
    sessionEpoch: number;
  }
}

/**
 * `next-auth/jwt` re-exports `@auth/core/jwt`, so the augmentation must target
 * the underlying module for the fields to be visible in callbacks.
 */
declare module "@auth/core/jwt" {
  interface JWT {
    uid: string;
    role: "ADMIN" | "USER";
    status: "ACTIVE" | "SUSPENDED";
    /** Must match `User.sessionEpoch`; a mismatch invalidates the token. */
    epoch: number;
  }
}
