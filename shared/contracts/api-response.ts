import { ApiErrorCode } from '../enums/errors.enum';

/**
 * Standard API Success Envelope
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
}

/**
 * Standard API Error Detail
 */
export interface ApiErrorDetail {
  code: ApiErrorCode | string;
  message: string;
  details?: Record<string, unknown> | unknown[];
}

/**
 * Standard API Error Envelope
 */
export interface ApiErrorResponse {
  success: false;
  error: ApiErrorDetail;
}

/**
 * Authoritative Unified API Response Contract
 */
export type ApiResponseContract<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;
