import { apiClient } from './api-client';
import { API_V1_PREFIX } from '../../shared/constants/api.constants';
import {
  CreateOrderRequest,
  CreateOrderResponseData,
  EditOrderRequest,
  EditOrderResponseData,
  OrderDetailResponseData,
  RecordPaymentRequest,
  RecordPaymentResponseData,
  VerifyPaymentResponseData,
  ConfirmOrderResponseData,
} from '../../shared/contracts/order.contract';
import { Order, OrderItem, Product } from '../../shared/types/entities.types';
import { OrderStatus, PaymentMethod } from '../../shared/enums/order.enum';
import { ApiResponse } from '../../shared/types/common.types';

export interface CatalogCategory {
  category: {
    id: string;
    name: string;
  };
  products: Product[];
}

export class OrderApiClient {
  /**
   * Public product catalog for a branch.
   */
  async getCatalog(branchId: string): Promise<ApiResponse<{ branchId: string; catalog: CatalogCategory[] }>> {
    return apiClient.request<{ branchId: string; catalog: CatalogCategory[] }>(
      `${API_V1_PREFIX}/branches/${branchId}/catalog`,
    );
  }

  /**
   * Customer: create order (sends only branchId and items array).
   */
  async createCustomerOrder(req: CreateOrderRequest): Promise<ApiResponse<CreateOrderResponseData>> {
    return apiClient.request<CreateOrderResponseData>(`${API_V1_PREFIX}/customer/orders`, {
      method: 'POST',
      authenticated: true,
      body: JSON.stringify(req),
    });
  }

  /**
   * Customer: list own orders.
   */
  async listCustomerOrders(limit: number = 50): Promise<ApiResponse<Order[]>> {
    return apiClient.request<Order[]>(`${API_V1_PREFIX}/customer/orders?limit=${limit}`, {
      authenticated: true,
    });
  }

  /**
   * Customer: get own order detail.
   */
  async getCustomerOrderDetail(orderId: string): Promise<ApiResponse<OrderDetailResponseData>> {
    return apiClient.request<OrderDetailResponseData>(`${API_V1_PREFIX}/customer/orders/${orderId}`, {
      authenticated: true,
    });
  }


  /**
   * Operator/Owner: list branch order queue.
   */
  async listBranchOrders(branchId: string, status?: OrderStatus, limit: number = 50): Promise<ApiResponse<Order[]>> {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (status) qs.set('status', status);
    return apiClient.request<Order[]>(`${API_V1_PREFIX}/branches/${branchId}/orders?${qs.toString()}`, {
      authenticated: true,
      requireSession: true,
    });
  }

  /**
   * Operator/Owner: get branch order detail.
   */
  async getBranchOrderDetail(branchId: string, orderId: string): Promise<ApiResponse<OrderDetailResponseData>> {
    return apiClient.request<OrderDetailResponseData>(
      `${API_V1_PREFIX}/branches/${branchId}/orders/${orderId}`,
      {
        authenticated: true,
        requireSession: true,
      },
    );
  }

  /**
   * Operator/Owner: book counter order directly with selectable starting stage.
   */
  async createBranchOrder(
    branchId: string,
    req: {
      items: Array<{ productId: string; quantity: number }>;
      initialStatus?: OrderStatus;
      paymentMethod?: PaymentMethod;
      paymentNotes?: string;
      customerUserId?: string;
      couponCode?: string;
    },
  ): Promise<ApiResponse<{ order: Order; items: OrderItem[]; expiresAt: string }>> {
    return apiClient.request<{ order: Order; items: OrderItem[]; expiresAt: string }>(
      `${API_V1_PREFIX}/branches/${branchId}/orders`,
      {
        method: 'POST',
        authenticated: true,
        requireSession: true,
        body: JSON.stringify(req),
      },
    );
  }

  /**
   * Operator/Owner: edit order within 60-minute window.
   */
  async editBranchOrder(
    branchId: string,
    orderId: string,
    req: EditOrderRequest,
  ): Promise<ApiResponse<EditOrderResponseData>> {
    return apiClient.request<EditOrderResponseData>(
      `${API_V1_PREFIX}/branches/${branchId}/orders/${orderId}`,
      {
        method: 'PATCH',
        authenticated: true,
        requireSession: true,
        body: JSON.stringify(req),
      },
    );
  }

  /**
   * Operator/Owner: transition order status.
   */
  async updateOrderStatus(branchId: string, orderId: string, status: OrderStatus): Promise<ApiResponse<Order>> {
    return apiClient.request<Order>(
      `${API_V1_PREFIX}/branches/${branchId}/orders/${orderId}/status`,
      {
        method: 'PATCH',
        authenticated: true,
        requireSession: true,
        body: JSON.stringify({ status }),
      },
    );
  }

  /**
   * Operator/Owner: record payment at reception.
   */
  async recordPayment(
    branchId: string,
    orderId: string,
    req: RecordPaymentRequest,
  ): Promise<ApiResponse<RecordPaymentResponseData>> {
    return apiClient.request<RecordPaymentResponseData>(
      `${API_V1_PREFIX}/branches/${branchId}/orders/${orderId}/payments`,
      {
        method: 'POST',
        authenticated: true,
        requireSession: true,
        body: JSON.stringify(req),
      },
    );
  }

  /**
   * Operator/Owner: verify payment.
   */
  async verifyPayment(
    branchId: string,
    orderId: string,
    paymentId: string,
    notes?: string,
  ): Promise<ApiResponse<VerifyPaymentResponseData>> {
    return apiClient.request<VerifyPaymentResponseData>(
      `${API_V1_PREFIX}/branches/${branchId}/orders/${orderId}/payments/${paymentId}/verify`,
      {
        method: 'POST',
        authenticated: true,
        requireSession: true,
        body: JSON.stringify({ notes }),
      },
    );
  }

  /**
   * Operator/Owner: confirm order after payment verification.
   */
  async confirmOrder(branchId: string, orderId: string): Promise<ApiResponse<ConfirmOrderResponseData>> {
    return apiClient.request<ConfirmOrderResponseData>(
      `${API_V1_PREFIX}/branches/${branchId}/orders/${orderId}/confirm`,
      {
        method: 'POST',
        authenticated: true,
        requireSession: true,
      },
    );
  }

  /**
   * Validate coupon code against subtotal for preview.
   */
  async validateCoupon(branchId: string, code: string, subtotal: number): Promise<ApiResponse<{ isValid: boolean; discount: number; reason?: string }>> {
    return apiClient.request<{ isValid: boolean; discount: number; reason?: string }>(
      `${API_V1_PREFIX}/branches/${branchId}/promotions/coupons/validate`,
      {
        method: 'POST',
        authenticated: true,
        body: JSON.stringify({ code, subtotal }),
      },
    );
  }

  /**
   * Operator/Owner: cancel order with optional refund and inventory restocking.
   */
  async cancelBranchOrder(
    branchId: string,
    orderId: string,
    payload: {
      refundType?: 'FULL' | 'PARTIAL' | 'NONE';
      refundAmount?: number;
      reason?: string;
      restockInventory?: boolean;
    } = {},
  ): Promise<ApiResponse<Order>> {
    return apiClient.request<Order>(
      `${API_V1_PREFIX}/branches/${branchId}/orders/${orderId}/cancel`,
      {
        method: 'POST',
        authenticated: true,
        requireSession: true,
        body: JSON.stringify(payload),
      },
    );
  }

  /**
   * Customer: cancel own order before payment.
   */
  async cancelCustomerOrder(orderId: string): Promise<ApiResponse<Order>> {
    return apiClient.request<Order>(
      `${API_V1_PREFIX}/customer/orders/${orderId}/cancel`,
      {
        method: 'POST',
        authenticated: true,
      },
    );
  }

  /**
   * Customer: fetch private / targeted coupons assigned directly to this customer.
   */
  async getCustomerPrivateCoupons(branchId?: string): Promise<
    ApiResponse<
      Array<{
        id: string;
        coupon_code: string;
        title: string;
        discount_type: 'PERCENTAGE' | 'FIXED';
        discount_value: number;
        min_order_value: number;
        max_discount: number | null;
        branch_id: string | null;
        expires_at: string;
      }>
    >
  > {
    const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
    return apiClient.request(
      `${API_V1_PREFIX}/customer/coupons${qs}`,
      {
        authenticated: true,
      },
    );
  }
}

export const orderApiClient = new OrderApiClient();

