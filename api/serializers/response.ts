import { ApiSuccessEnvelope, ApiErrorEnvelope } from '../../shared/types/common.types';
import { ApiErrorCode } from '../../shared/enums/errors.enum';
import { HTTP_STATUS } from '../../shared/constants/api.constants';

export function buildSuccessEnvelope<T>(data: T): ApiSuccessEnvelope<T> {
  return {
    success: true,
    data,
  };
}

export function buildErrorEnvelope(
  code: ApiErrorCode | string,
  message: string,
  details?: Record<string, unknown> | unknown[],
): ApiErrorEnvelope {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };
}

export function successResponse<T>(data: T, status: number = HTTP_STATUS.OK): Response {
  return new Response(JSON.stringify(buildSuccessEnvelope(data)), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function errorResponse(
  code: ApiErrorCode | string,
  message: string,
  details?: Record<string, unknown> | unknown[],
  status: number = HTTP_STATUS.INTERNAL_SERVER_ERROR,
): Response {
  return new Response(JSON.stringify(buildErrorEnvelope(code, message, details)), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
