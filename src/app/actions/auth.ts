"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { AuthError } from "next-auth";

import { signIn, signOut } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { hashPassword, verifyPassword } from "@/lib/security/password";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import {
  RATE_LIMITS,
  consumeRateLimit,
  resetRateLimit,
} from "@/lib/security/rate-limit";
import { hashForLogging } from "@/lib/security/crypto";
import { recordSecurityEvent } from "@/lib/audit/service";
import { getSetting } from "@/lib/settings/service";
import { SETTING_KEYS } from "@/lib/constants";
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
} from "@/lib/validation/auth";
import { requireActor } from "@/lib/auth/session";
import { toAppError } from "@/lib/errors";

/**
 * Authentication server actions.
 *
 * Each action validates with Zod, verifies Turnstile server-side, applies a
 * Redis rate limit, then delegates. Failures are always generic so account
 * existence cannot be enumerated (RULES.md §5).
 */

export type ActionState =
  | { status: "idle" }
  | { status: "success"; message?: string }
  | {
      status: "error";
      message: string;
      fieldErrors?: Record<string, string[]>;
    };

/** Client IP, used only as a hashed rate-limit and log key. */
async function clientIp(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  return (
    forwarded?.split(",")[0]?.trim() ?? headerList.get("x-real-ip") ?? "unknown"
  );
}

function fieldErrorsOf(error: {
  flatten: () => { fieldErrors: Record<string, string[] | undefined> };
}): Record<string, string[]> {
  const flattened = error.flatten().fieldErrors;
  const result: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(flattened)) {
    if (value) {
      result[key] = value;
    }
  }
  return result;
}

export async function loginAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    turnstileToken: formData.get("turnstileToken"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  const ip = await clientIp();
  const ipHash = hashForLogging(ip);

  const limit = await consumeRateLimit(RATE_LIMITS.login, ipHash);
  if (!limit.allowed) {
    await recordSecurityEvent({
      event: "LOGIN_RATE_LIMITED",
      outcome: "BLOCKED",
      ip,
    });
    return {
      status: "error",
      message: `Too many attempts. Try again in ${limit.retryAfterSeconds} seconds.`,
    };
  }

  try {
    await verifyTurnstileToken(parsed.data.turnstileToken, {
      remoteIp: ip,
      action: "login",
    });
  } catch {
    await recordSecurityEvent({
      event: "TURNSTILE_FAILED",
      outcome: "BLOCKED",
      ip,
    });
    return { status: "error", message: "Verification failed. Please try again." };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      await recordSecurityEvent({
        event: "LOGIN_FAILURE",
        outcome: "FAILURE",
        ip,
      });
      // Deliberately generic: never reveal whether the email exists.
      return { status: "error", message: "Incorrect email or password." };
    }
    throw error;
  }

  await resetRateLimit(RATE_LIMITS.login, ipHash);
  await recordSecurityEvent({ event: "LOGIN_SUCCESS", outcome: "SUCCESS", ip });

  return { status: "success" };
}

export async function registerAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    acceptTerms: formData.get("acceptTerms") === "on",
    turnstileToken: formData.get("turnstileToken"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  const ip = await clientIp();
  const ipHash = hashForLogging(ip);

  const limit = await consumeRateLimit(RATE_LIMITS.register, ipHash);
  if (!limit.allowed) {
    await recordSecurityEvent({
      event: "REGISTER_RATE_LIMITED",
      outcome: "BLOCKED",
      ip,
    });
    return {
      status: "error",
      message: "Too many registration attempts. Please try again later.",
    };
  }

  if (!(await getSetting(SETTING_KEYS.registrationEnabled))) {
    await recordSecurityEvent({
      event: "REGISTER_DISABLED",
      outcome: "BLOCKED",
      ip,
    });
    return { status: "error", message: "Registration is currently closed." };
  }

  try {
    await verifyTurnstileToken(parsed.data.turnstileToken, {
      remoteIp: ip,
      action: "register",
    });
  } catch {
    return { status: "error", message: "Verification failed. Please try again." };
  }

  const passwordHash = await hashPassword(parsed.data.password);

  try {
    // Role is hard-coded: public signup can never create an ADMIN (RULES.md §5).
    await prisma.user.create({
      data: {
        email: parsed.data.email,
        name: parsed.data.name,
        passwordHash,
        role: "USER",
        status: "ACTIVE",
      },
      select: { id: true },
    });
  } catch (error) {
    // A unique-constraint violation returns the same response as success, so the
    // endpoint cannot be used to test whether an email is registered.
    if ((error as { code?: string }).code !== "P2002") {
      throw toAppError(error);
    }
  }

  await recordSecurityEvent({
    event: "REGISTER_SUCCESS",
    outcome: "SUCCESS",
    ip,
  });

  return {
    status: "success",
    message: "Account created. You can now sign in.",
  };
}

export async function changePasswordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireActor();

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  const ip = await clientIp();

  const limit = await consumeRateLimit(RATE_LIMITS.passwordChange, actor.id);
  if (!limit.allowed) {
    return {
      status: "error",
      message: "Too many attempts. Please try again later.",
    };
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: { passwordHash: true },
  });

  if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    return {
      status: "error",
      message: "Your current password is incorrect.",
      fieldErrors: { currentPassword: ["Incorrect password"] },
    };
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);

  // Bumping the epoch invalidates every JWT already issued for this account.
  await prisma.user.update({
    where: { id: actor.id },
    data: { passwordHash, sessionEpoch: { increment: 1 } },
  });

  await recordSecurityEvent({
    userId: actor.id,
    event: "PASSWORD_CHANGED",
    outcome: "SUCCESS",
    ip,
  });

  revalidatePath("/dashboard/profile");
  await signOut({ redirect: false });

  return {
    status: "success",
    message: "Password updated. Please sign in again.",
  };
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

