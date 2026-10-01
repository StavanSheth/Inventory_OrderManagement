import { Order, OrderItem } from '../../../shared/types/entities.types';
import { OrderRepository } from '../../../database/repositories/order.repository';

export interface IOrdersService {
  getOrderById(branchId: string, orderId: string): Promise<{ order: Order; items: OrderItem[] } | null>;
  listOrders(branchId: string, limit?: number): Promise<Order[]>;
}

export const ORDERS_SERVICE_TOKEN = 'IOrdersService';

export class OrdersService implements IOrdersService {
  constructor(private orderRepo: OrderRepository) {}

  async getOrderById(branchId: string, orderId: string): Promise<{ order: Order; items: OrderItem[] } | null> {
    const order = await this.orderRepo.findById(orderId);
    if (!order || order.branch_id !== branchId) {
      return null;
    }
    const items = await this.orderRepo.getOrderItems(orderId);
    return { order, items };
  }

  async listOrders(branchId: string, limit: number = 50): Promise<Order[]> {
    return this.orderRepo.listByBranch(branchId, limit);
  }
}
