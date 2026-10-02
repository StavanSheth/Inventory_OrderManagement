import { ApiResponse } from '../../shared/types/common.types';
import { apiClient } from './api-client';
import { DashboardSummaryResponse } from '../../shared/contracts/dashboard.contract';
import { PaginatedOrderHistoryResponse, OrderHistoryQueryOptions } from '../../shared/contracts/order-history.contract';
import { CreateBranchRequest, UpdateBranchRequest, BranchDetailResponse } from '../../shared/contracts/branch.contract';
import { UpdateBranchSettingsRequest, BranchSettingsResponse } from '../../shared/contracts/settings.contract';
import { BranchDeletionPreviewResponse, AnonymizeCustomerResponse } from '../../shared/contracts/deletion.contract';
import { Branch } from '../../shared/types/entities.types';

export class OwnerApiClient {
  async getDashboardSummary(params: {
    branchId?: string;
    preset?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<ApiResponse<DashboardSummaryResponse>> {
    const searchParams = new URLSearchParams();
    if (params.branchId && params.branchId !== 'ALL') searchParams.set('branchId', params.branchId);
    if (params.preset) searchParams.set('preset', params.preset);
    if (params.startDate) searchParams.set('startDate', params.startDate);
    if (params.endDate) searchParams.set('endDate', params.endDate);

    const query = searchParams.toString();
    return apiClient.request<DashboardSummaryResponse>(
      `/api/v1/owner/dashboard/summary${query ? `?${query}` : ''}`,
      { authenticated: true, requireSession: true }
    );
  }

  async getOrderHistory(params: OrderHistoryQueryOptions): Promise<ApiResponse<PaginatedOrderHistoryResponse>> {
    const searchParams = new URLSearchParams();
    if (params.branchId && params.branchId !== 'ALL') searchParams.set('branchId', params.branchId);
    if (params.status) searchParams.set('status', params.status);
    if (params.customerUserId) searchParams.set('customerUserId', params.customerUserId);
    if (params.startDate) searchParams.set('startDate', params.startDate);
    if (params.endDate) searchParams.set('endDate', params.endDate);
    if (params.page !== undefined) searchParams.set('page', params.page.toString());
    if (params.limit !== undefined) searchParams.set('limit', params.limit.toString());

    const query = searchParams.toString();
    return apiClient.request<PaginatedOrderHistoryResponse>(
      `/api/v1/orders/history${query ? `?${query}` : ''}`,
      { authenticated: true, requireSession: true }
    );
  }

  async listBranches(): Promise<ApiResponse<Branch[]>> {
    return apiClient.request<Branch[]>('/api/v1/owner/branches', {
      authenticated: true,
      requireSession: true,
    });
  }

  async createBranch(payload: CreateBranchRequest): Promise<ApiResponse<Branch>> {
    return apiClient.request<Branch>('/api/v1/owner/branches', {
      method: 'POST',
      body: JSON.stringify(payload),
      authenticated: true,
      requireSession: true,
    });
  }

  async getBranch(id: string): Promise<ApiResponse<BranchDetailResponse>> {
    return apiClient.request<BranchDetailResponse>(`/api/v1/owner/branches/${id}`, {
      authenticated: true,
      requireSession: true,
    });
  }

  async updateBranch(id: string, payload: UpdateBranchRequest): Promise<ApiResponse<Branch>> {
    return apiClient.request<Branch>(`/api/v1/owner/branches/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
      authenticated: true,
      requireSession: true,
    });
  }

  async setBranchStatus(id: string, status: 'ACTIVE' | 'INACTIVE'): Promise<ApiResponse<Branch>> {
    return apiClient.request<Branch>(`/api/v1/owner/branches/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
      authenticated: true,
      requireSession: true,
    });
  }

  async updateBranchSettings(id: string, payload: UpdateBranchSettingsRequest): Promise<ApiResponse<BranchSettingsResponse>> {
    return apiClient.request<BranchSettingsResponse>(`/api/v1/owner/branches/${id}/settings`, {
      method: 'PUT',
      body: JSON.stringify(payload),
      authenticated: true,
      requireSession: true,
    });
  }

  async previewBranchDeletion(branchId: string): Promise<ApiResponse<BranchDeletionPreviewResponse>> {
    return apiClient.request<BranchDeletionPreviewResponse>(
      `/api/v1/owner/data/preview-branch-deletion?branchId=${encodeURIComponent(branchId)}`,
      { authenticated: true, requireSession: true }
    );
  }

  async deactivateBranch(branchId: string): Promise<ApiResponse<{ branchId: string; status: string; message: string }>> {
    return apiClient.request<{ branchId: string; status: string; message: string }>(
      '/api/v1/owner/data/deactivate-branch',
      {
        method: 'POST',
        body: JSON.stringify({ branchId }),
        authenticated: true,
        requireSession: true,
      }
    );
  }

  async anonymizeCustomer(customerUserId: string): Promise<ApiResponse<AnonymizeCustomerResponse>> {
    return apiClient.request<AnonymizeCustomerResponse>(
      '/api/v1/owner/data/anonymize-customer',
      {
        method: 'POST',
        body: JSON.stringify({ customerUserId }),
        authenticated: true,
        requireSession: true,
      }
    );
  }
}

export const ownerApiClient = new OwnerApiClient();
