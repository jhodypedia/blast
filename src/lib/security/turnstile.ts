import "server-only";

import { hashForLogging } from "@/lib/security/crypto";
import { captchaFailed } from "@/lib/errors";
import { logger } from "@/lib/observability/logger";
import { serverEnv } from "@/lib/env";

/**
 * Cloudflare Turnstile verification.
 *
 * Verification happens server-side only; a client-side "success" callback is
 * never treated as proof (RULES.md §9). When no secret is configured the
 * verifier refuses to pass tokens in production and skips only in development,
 * so a misconfigured production deployment cannot silently lose protection.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type TurnstileApiResponse = {
  success: boolean;
  "error-codes"?: string[];
  action?: string;
  hostname?: string;
};

export type TurnstileContext = {
  /** Raw client IP, hashed before it reaches any log sink. */
  remoteIp?: string;
  /** Optional action name to bind the token to a specific form. */
  action?: string;
};

/**
 * Verifies a Turnstile token. Throws `AppError('CAPTCHA_FAILED')` on failure.
 */
export async function verifyTurnstileToken(
  token: string | undefined | null,
  context: TurnstileContext = {},
): Promise<void> {
  const env = serverEnv();
  const log = logger("security");

  if (!env.TURNSTILE_SECRET_KEY) {
    if (env.NODE_ENV === "production") {
      log.error({ event: "turnstile.misconfigured" }, "Turnstile secret missing");
      throw captchaFailed();
    }
    log.warn(
      { event: "turnstile.skipped" },
      "TURNSTILE_SECRET_KEY not set; skipping verification outside production",
    );
    return;
  }

  if (!token || token.trim().length === 0) {
    throw captchaFailed();
  }

  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET_KEY,
    response: token,
  });
  if (context.remoteIp) {
    body.set("remoteip", context.remoteIp);
  }

  let payload: TurnstileApiResponse;
  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      log.warn(
        { event: "turnstile.http_error", status: response.status },
        "Turnstile verification returned a non-OK status",
      );
      throw captchaFailed();
    }

    payload = (await response.json()) as TurnstileApiResponse;
  } catch (error) {
    log.warn(
      {
        event: "turnstile.request_failed",
        reason: error instanceof Error ? error.name : "unknown",
      },
      "Turnstile verification request failed",
    );
    throw captchaFailed();
  }

  if (!payload.success) {
    log.warn(
      {
        event: "turnstile.rejected",
        errorCodes: payload["error-codes"] ?? [],
        ipHash: context.remoteIp ? hashForLogging(context.remoteIp) : undefined,
      },
      "Turnstile token rejected",
    );
    throw captchaFailed();
  }

  if (context.action && payload.action && payload.action !== context.action) {
    log.warn(
      { event: "turnstile.action_mismatch", expected: context.action },
      "Turnstile action mismatch",
    );
    throw captchaFailed();
  }
}
