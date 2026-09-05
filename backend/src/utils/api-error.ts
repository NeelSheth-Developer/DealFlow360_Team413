/** Stable machine-readable codes clients can branch on. */
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'FIELD_NOT_ALLOWED'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_VERIFIED'
  | 'ACCOUNT_DISABLED'
  | 'EMAIL_ALREADY_REGISTERED'
  | 'OTP_INVALID'
  | 'OTP_EXPIRED'
  | 'OTP_TOO_MANY_ATTEMPTS'
  | 'OTP_RESEND_TOO_SOON'
  | 'PASSWORD_REUSED'
  | 'INVALID_REFRESH_TOKEN'
  | 'WRONG_KIND'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'FEATURE_DISABLED'
  | 'INTERNAL_ERROR';

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(code: ErrorCode, message: string, details?: unknown) {
    return new ApiError(400, code, message, details);
  }

  /**
   * Deliberately one message for every credential failure — unknown email, wrong
   * password, or an address that exists only in the other table. Distinct wording
   * would let anyone probe which addresses are registered.
   */
  static invalidCredentials() {
    return new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  static unauthorized(code: ErrorCode = 'INVALID_CREDENTIALS', message = 'Unauthorized') {
    return new ApiError(401, code, message);
  }

  static forbidden(code: ErrorCode = 'FORBIDDEN', message = 'Forbidden') {
    return new ApiError(403, code, message);
  }

  static notFound(message = 'Not found') {
    return new ApiError(404, 'NOT_FOUND', message);
  }

  static conflict(code: ErrorCode, message: string) {
    return new ApiError(409, code, message);
  }

  static gone(code: ErrorCode, message: string) {
    return new ApiError(410, code, message);
  }

  static tooManyRequests(code: ErrorCode = 'RATE_LIMITED', message = 'Too many requests') {
    return new ApiError(429, code, message);
  }
}
