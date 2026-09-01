/**
 * Typed application errors.
 *
 * Route handlers and server actions map these to safe HTTP responses. Internal
 * details stay in `internalMessage`, which is logged but never serialised to a
 * client (RULES.md §9).
 */

export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "INVALID_STATE"
  | "RATE_LIMITED"
  | "CAPTCHA_FAILED"
  | "INSUFFICIENT_BALANCE"
  | "LIMIT_EXCEEDED"
  | "DEPENDENCY_UNAVAILABLE"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  CONFLICT: 409,
  INVALID_STATE: 409,
  RATE_LIMITED: 429,
  CAPTCHA_FAILED: 400,
  INSUFFICIENT_BALANCE: 422,
  LIMIT_EXCEEDED: 422,
  DEPENDENCY_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly fieldErrors?: Record<string, string[]>;
  readonly internalMessage?: string;
  readonly retryAfterSeconds?: number;

  constructor(
    code: AppErrorCode,
    /** Safe, user-facing message. */
    message: string,
    options?: {
      fieldErrors?: Record<string, string[]>;
      internalMessage?: string;
      retryAfterSeconds?: number;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options?.cause });
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.fieldErrors = options?.fieldErrors;
    this.internalMessage = options?.internalMessage;
    this.retryAfterSeconds = options?.retryAfterSeconds;
  }
}

export function unauthenticated(message = "Please sign in to continue."): AppError {
  return new AppError("UNAUTHENTICATED", message);
}

export function forbidden(
  message = "You do not have permission to perform this action.",
  internalMessage?: string,
): AppError {
  return new AppError("FORBIDDEN", message, { internalMessage });
}

export function notFound(message = "The requested resource was not found."): AppError {
  return new AppError("NOT_FOUND", message);
}

export function validationError(
  message: string,
  fieldErrors?: Record<string, string[]>,
): AppError {
  return new AppError("VALIDATION_ERROR", message, { fieldErrors });
}

export function conflict(message: string): AppError {
  return new AppError("CONFLICT", message);
}

export function invalidState(message: string): AppError {
  return new AppError("INVALID_STATE", message);
}

export function rateLimited(retryAfterSeconds: number): AppError {
  return new AppError(
    "RATE_LIMITED",
    "Too many attempts. Please wait before trying again.",
    { retryAfterSeconds },
  );
}

export function captchaFailed(): AppError {
  return new AppError(
    "CAPTCHA_FAILED",
    "Verification failed. Please complete the challenge again.",
  );
}

export function internalError(internalMessage: string, cause?: unknown): AppError {
  return new AppError(
    "INTERNAL_ERROR",
    "Something went wrong. Please try again.",
    { internalMessage, cause },
  );
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/**
 * Normalises any thrown value into an `AppError`, keeping unknown internals
 * out of client responses.
 */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }
  if (error instanceof Error) {
    return internalError(error.message, error);
  }
  return internalError("Unknown error value thrown", error);
}
