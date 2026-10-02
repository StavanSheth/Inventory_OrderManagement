import { AppError } from '../../backend/errors/app-error';
import { errorResponse } from '../serializers/response';
import { ApiErrorCode } from '../../shared/enums/errors.enum';
import { HTTP_STATUS } from '../../shared/constants/api.constants';

export function handleApiError(error: unknown, additionalHeaders?: Record<string, string>): Response {
  const isProductionLike = process.env.NODE_ENV === 'production' || (process.env.NODE_ENV as string) === 'staging' || process.env.APP_ENV === 'staging';

  if (error instanceof AppError) {
    const message = isProductionLike && error.statusCode >= 500
      ? 'An internal server error occurred'
      : error.message;
    const details = isProductionLike && error.statusCode >= 500 ? undefined : error.details;

    return errorResponse(error.code, message, details, error.statusCode, additionalHeaders);
  }

  const sanitizedMessage = isProductionLike
    ? 'An internal server error occurred'
    : error instanceof Error
      ? error.message
      : 'Unknown server error';

  return errorResponse(
    ApiErrorCode.INTERNAL_ERROR,
    sanitizedMessage,
    undefined,
    HTTP_STATUS.INTERNAL_SERVER_ERROR,
    additionalHeaders,
  );
}
