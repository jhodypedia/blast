import "server-only";

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "@/lib/auth/config";
import { prisma } from "@/lib/db/prisma";
import { loginSchema } from "@/lib/validation/auth";
import {
  verifyPassword,
  verifyPasswordAgainstDummy,
} from "@/lib/security/password";
import { logger } from "@/lib/observability/logger";

/**
 * Node-only Auth.js instance.
 *
 * The credentials provider is the single place where a password is checked.
 * Role and status always come from the database row, never from the request.
 * Turnstile verification and rate limiting happen in the login server action
 * before `signIn` is called, so this provider stays focused on credentials.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials) {
        const log = logger("auth");

        const parsed = loginSchema
          .pick({ email: true, password: true })
          .safeParse(rawCredentials);

        if (!parsed.success) {
          return null;
        }

        const { email, password } = parsed.data;

        const user = await prisma.user.findFirst({
          where: { email, deletedAt: null },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            status: true,
            passwordHash: true,
            sessionEpoch: true,
          },
        });

        if (!user) {
          // Constant-ish work regardless of account existence.
          await verifyPasswordAgainstDummy(password);
          return null;
        }

        const passwordMatches = await verifyPassword(password, user.passwordHash);
        if (!passwordMatches) {
          return null;
        }

        if (user.status !== "ACTIVE") {
          log.warn(
            { event: "login.blocked_suspended", userId: user.id },
            "Suspended account attempted to sign in",
          );
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
          sessionEpoch: user.sessionEpoch,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,

    async jwt({ token, user, trigger }) {
      if (user) {
        // `authorize` above is the only producer of this object, so the shape is
        // known; NextAuth widens it to its own `User` type.
        const authorized = user as unknown as {
          id: string;
          role: "ADMIN" | "USER";
          status: "ACTIVE" | "SUSPENDED";
          sessionEpoch: number;
        };

        token.uid = authorized.id;
        token.role = authorized.role;
        token.status = authorized.status;
        token.epoch = authorized.sessionEpoch;
        return token;
      }

      // Re-validate against the database on refresh so suspensions, role
      // changes and password changes take effect without waiting for expiry.
      if (token.uid && (trigger === "update" || trigger === undefined)) {
        const current = await prisma.user.findFirst({
          where: { id: token.uid, deletedAt: null },
          select: { role: true, status: true, sessionEpoch: true },
        });

        if (!current || current.sessionEpoch !== token.epoch) {
          // Force the session to be treated as invalid.
          return null;
        }

        token.role = current.role;
        token.status = current.status;
      }

      return token;
    },

    async session({ session, token }) {
      if (token.uid) {
        session.user.id = token.uid;
        session.user.role = token.role;
        session.user.status = token.status;
      }
      return session;
    },
  },
});
