import { ApiResponse } from '../../shared/types/common.types';
import { HealthData } from '../../shared/schemas/health.schema';
import { API_V1_PREFIX } from '../../shared/constants/api.constants';
import { authClient } from '../modules/auth/auth-client';

export interface ApiRequestOptions extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>;
  authenticated?: boolean;
  requireSession?: boolean;
}

export class ApiClient {
  constructor(private baseUrl: string = '') {}

  /**
   * Performs an HTTP request with centralized header handling.
   * If authenticated is true, retrieves a fresh Firebase ID token.
   * If requireSession is true, attaches x-session-token header.
   */
  async request<T>(path: string, options: ApiRequestOptions = {}): Promise<ApiResponse<T>> {
    const { authenticated = false, requireSession = false, headers = {}, ...rest } = options;

    let requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    if (authenticated || requireSession) {
      const authHeaders = await authClient.getAuthorizedHeaders({ requireSession });
      requestHeaders = {
        ...requestHeaders,
        ...authHeaders,
      };
    }

    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...rest,
      headers: requestHeaders,
    });

    const json = (await res.json()) as ApiResponse<T>;
    return json;
  }

  async getHealth(): Promise<ApiResponse<HealthData>> {
    return this.request<HealthData>(`${API_V1_PREFIX}/health`);
  }
}

export const apiClient = new ApiClient();
