import { AppError } from '../../backend/errors/app-error';
import { errorResponse } from '../serializers/response';
import { ApiErrorCode } from '../../shared/enums/errors.enum';
import { HTTP_STATUS } from '../../shared/constants/api.constants';

export function handleApiError(error: unknown): Response {
  if (error instanceof AppError) {
    return errorResponse(error.code, error.message, error.details, error.statusCode);
  }

  if (error instanceof Error) {
    return errorResponse(
      ApiErrorCode.INTERNAL_ERROR,
      error.message || 'An unexpected error occurred',
      undefined,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }

  return errorResponse(
    ApiErrorCode.INTERNAL_ERROR,
    'Unknown server error',
    undefined,
    HTTP_STATUS.INTERNAL_SERVER_ERROR,
  );
}
