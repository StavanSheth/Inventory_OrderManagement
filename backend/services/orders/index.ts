import { Order, OrderItem } from '../../../shared/types/entities.types';

export interface IOrdersService {
  getOrderById(branchId: string, orderId: string): Promise<{ order: Order; items: OrderItem[] } | null>;
  listOrders(branchId: string, limit?: number): Promise<Order[]>;
}

export const ORDERS_SERVICE_TOKEN = 'IOrdersService';
