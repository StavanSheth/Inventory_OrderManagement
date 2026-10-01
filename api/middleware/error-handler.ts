import { AppError } from '../../backend/errors/app-error';
import { errorResponse } from '../serializers/response';
import { ApiErrorCode } from '../../shared/enums/errors.enum';
import { HTTP_STATUS } from '../../shared/constants/api.constants';

export function handleApiError(error: unknown, additionalHeaders?: Record<string, string>): Response {
  if (error instanceof AppError) {
    return errorResponse(error.code, error.message, error.details, error.statusCode, additionalHeaders);
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const sanitizedMessage = isProduction
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
