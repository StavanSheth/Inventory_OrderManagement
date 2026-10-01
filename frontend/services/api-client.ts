import { ApiResponse } from '../../shared/types/common.types';
import { HealthData } from '../../shared/schemas/health.schema';
import { API_V1_PREFIX } from '../../shared/constants/api.constants';

export class ApiClient {
  constructor(private baseUrl: string = '') {}

  async getHealth(): Promise<ApiResponse<HealthData>> {
    const res = await fetch(`${this.baseUrl}${API_V1_PREFIX}/health`);
    return res.json() as Promise<ApiResponse<HealthData>>;
  }
}

export const apiClient = new ApiClient();
