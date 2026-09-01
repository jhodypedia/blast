import "server-only";

/**
 * Failure classification for WhatsApp send attempts (RULES.md §12).
 *
 * Only clearly transient failures are marked retryable. Anything that could
 * mean "the message may have been delivered" is classified as ambiguous and
 * routed to reconciliation instead of being retried.
 */

export type Classification = {
  status: "RETRYABLE_FAILED" | "FAILED" | "UNKNOWN";
  category: string;
  reason: string;
};

/** Error codes that indicate a transient transport problem. */
const RETRYABLE_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "EPIPE",
  "EAI_AGAIN",
  "ENETUNREACH",
  "ENOTFOUND",
]);

/** HTTP-ish status codes the provider surfaces through Boom-style errors. */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Permanent recipient-level problems. */
const PERMANENT_STATUS = new Set([400, 401, 403, 404, 405, 410]);

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string" ? error : "Unknown provider error";
}

/**
 * Reads a Boom-style status code without importing `@hapi/boom`, which is a
 * transitive dependency of the WhatsApp library rather than one of ours.
 */
function statusCodeOf(error: unknown): number | undefined {
  const output = (error as { output?: { statusCode?: unknown } } | null)?.output;
  const status = output?.statusCode;
  return typeof status === "number" ? status : undefined;
}

/**
 * Classifies a thrown provider error.
 *
 * `sentAttempted` must be true when the socket write was already issued: in that
 * case a timeout cannot be distinguished from a slow-but-successful delivery, so
 * the outcome is ambiguous rather than retryable.
 */
export function classifySendError(
  error: unknown,
  sentAttempted: boolean,
): Classification {
  const message = messageOf(error).slice(0, 255);

  const status = statusCodeOf(error);
  if (status !== undefined) {
    if (PERMANENT_STATUS.has(status)) {
      return {
        status: "FAILED",
        category: `PROVIDER_${status}`,
        reason: message,
      };
    }
    if (RETRYABLE_STATUS.has(status)) {
      return sentAttempted
        ? {
            status: "UNKNOWN",
            category: "AMBIGUOUS_AFTER_WRITE",
            reason: message,
          }
        : {
            status: "RETRYABLE_FAILED",
            category: `PROVIDER_${status}`,
            reason: message,
          };
    }
  }

  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && RETRYABLE_CODES.has(code)) {
    return sentAttempted
      ? { status: "UNKNOWN", category: "AMBIGUOUS_AFTER_WRITE", reason: message }
      : { status: "RETRYABLE_FAILED", category: code, reason: message };
  }

  if (/timed? ?out/i.test(message)) {
    return sentAttempted
      ? { status: "UNKNOWN", category: "AMBIGUOUS_TIMEOUT", reason: message }
      : { status: "RETRYABLE_FAILED", category: "TIMEOUT", reason: message };
  }

  if (/not.*(on|registered).*whatsapp|invalid.*jid/i.test(message)) {
    return {
      status: "FAILED",
      category: "RECIPIENT_NOT_ON_WHATSAPP",
      reason: "Recipient is not reachable on WhatsApp",
    };
  }

  if (/connection closed|socket|not open|lost connection/i.test(message)) {
    return sentAttempted
      ? {
          status: "UNKNOWN",
          category: "CONNECTION_LOST_AFTER_WRITE",
          reason: message,
        }
      : {
          status: "RETRYABLE_FAILED",
          category: "CONNECTION_LOST",
          reason: message,
        };
  }

  // Unclassified errors are treated as ambiguous when a write was attempted, so
  // the platform never risks a duplicate message.
  return sentAttempted
    ? { status: "UNKNOWN", category: "UNCLASSIFIED_AFTER_WRITE", reason: message }
    : { status: "FAILED", category: "UNCLASSIFIED", reason: message };
}

/** Exponential backoff with jitter for retryable failures. */
export function retryBackoffMs(attempt: number): number {
  const base = Math.min(30_000 * 2 ** Math.max(attempt - 1, 0), 300_000);
  const jitter = Math.floor(Math.random() * 5_000);
  return base + jitter;
}
