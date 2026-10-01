import { ApiErrorCode } from '../../shared/enums/errors.enum';
import { HTTP_STATUS } from '../../shared/constants/api.constants';

export class AppError extends Error {
  public readonly code: ApiErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown> | unknown[];

  constructor(
    message: string,
    code: ApiErrorCode = ApiErrorCode.INTERNAL_ERROR,
    statusCode: number = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    details?: Record<string, unknown> | unknown[],
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string = 'Bad request', details?: Record<string, unknown>) {
    super(message, ApiErrorCode.BAD_REQUEST, HTTP_STATUS.BAD_REQUEST, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found', details?: Record<string, unknown>) {
    super(message, ApiErrorCode.NOT_FOUND, HTTP_STATUS.NOT_FOUND, details);
  }
}

export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed', details?: unknown[]) {
    super(message, ApiErrorCode.VALIDATION_ERROR, HTTP_STATUS.BAD_REQUEST, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized', details?: Record<string, unknown>) {
    super(message, ApiErrorCode.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden', details?: Record<string, unknown>) {
    super(message, ApiErrorCode.FORBIDDEN, HTTP_STATUS.FORBIDDEN, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Conflict occurred', details?: Record<string, unknown>) {
    super(message, ApiErrorCode.CONFLICT, HTTP_STATUS.CONFLICT, details);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message: string = 'Too many requests. Please try again later.', details?: Record<string, unknown>) {
    super(message, ApiErrorCode.RATE_LIMITED, HTTP_STATUS.TOO_MANY_REQUESTS, details);
  }
}
