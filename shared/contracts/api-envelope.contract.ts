import { ApiSuccessEnvelope, ApiErrorEnvelope } from '../types/common.types';

export type HealthContractResponse = ApiSuccessEnvelope<{
  status: 'ok';
  timestamp?: string;
  version?: string;
}>;

export type ErrorContractResponse = ApiErrorEnvelope;
