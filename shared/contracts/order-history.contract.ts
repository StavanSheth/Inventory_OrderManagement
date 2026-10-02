import { Order, OrderItem } from '../types/entities.types';
import { OrderStatus } from '../enums/order.enum';

export interface OrderHistoryQueryOptions {
  branchId?: string;
  customerUserId?: string;
  startDate?: string;
  endDate?: string;
  status?: OrderStatus;
  page?: number;
  limit?: number;
}

export interface PaginatedOrderHistoryResponse {
  orders: Array<Order & { items?: OrderItem[] }>;
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}
