import { ApiErrorCode } from '../enums/errors.enum';

export type Id = string;
export type IsoDateTimeUtc = string;

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
}

export interface ApiErrorDetails {
  code: ApiErrorCode | string;
  message: string;
  details?: Record<string, unknown> | unknown[];
}

export interface ApiErrorEnvelope {
  success: false;
  error: ApiErrorDetails;
}

export type ApiResponse<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
