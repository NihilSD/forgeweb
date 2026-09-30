import { ErrorCode } from '@forge/shared';

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  CSRF_FAILED: 403,
  PLAN_REQUIRED: 402,
  LIMIT_REACHED: 403,
  EMAIL_NOT_VERIFIED: 403,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_LOCKED: 429,
  TWO_FACTOR_REQUIRED: 401,
  TWO_FACTOR_INVALID: 401,
  WEAK_PASSWORD: 400,
  AGE_RESTRICTED: 403,
  TOKEN_INVALID: 400,
  PAYLOAD_TOO_LARGE: 413,
  ATTEMPT_CLOSED: 409,
  INTERNAL: 500,
};

/** The only error type services throw. Rendered as { error: { code, message, details? } }. */
export class ApiError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
    status?: number,
  ) {
    super(message);
    this.status = status ?? STATUS[code];
  }

  static notFound(what = 'Resource') {
    return new ApiError(ErrorCode.NOT_FOUND, `${what} not found.`);
  }
  static forbidden(message = 'You do not have access to this resource.') {
    return new ApiError(ErrorCode.FORBIDDEN, message);
  }
  static unauthenticated() {
    return new ApiError(ErrorCode.UNAUTHENTICATED, 'Please sign in to continue.');
  }
}
