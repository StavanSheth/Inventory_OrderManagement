import {
  ApiSuccessResponse,
  ApiErrorDetail,
  ApiErrorResponse,
  ApiResponseContract,
} from '../contracts/api-response';

export type Id = string;
export type IsoDateTimeUtc = string;

export type ApiSuccessEnvelope<T> = ApiSuccessResponse<T>;
export type ApiErrorDetails = ApiErrorDetail;
export type ApiErrorEnvelope = ApiErrorResponse;
export type ApiResponse<T> = ApiResponseContract<T>;

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
