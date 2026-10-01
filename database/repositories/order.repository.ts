import { BaseRepository } from './base.repository';
import { Order, OrderItem } from '../../shared/types/entities.types';
import { OrderStatus, PaymentStatus, PaymentMethod } from '../../shared/enums/order.enum';

export interface CreateOrderItemInput {
  id: string;
  product_id: string;
  product_name_snapshot: string;
  unit_price_snapshot: number;
  quantity: number;
  line_discount?: number;
  line_total: number;
}

export interface CreateOrderInput {
  id: string;
  order_number: string;
  branch_id: string;
  customer_user_id: string;
  status?: OrderStatus;
  subtotal: number;
  discount?: number;
  tax?: number;
  total: number;
  coupon_id?: string | null;
  offer_id?: string | null;
  payment_status?: PaymentStatus;
  payment_method?: PaymentMethod | null;
  placed_at?: string;
  expires_at: string;
  items: CreateOrderItemInput[];
}

export class OrderRepository extends BaseRepository {
  async findById(id: string): Promise<Order | null> {
    return this.db
      .prepare('SELECT * FROM orders WHERE id = ?')
      .bind(id)
      .first<Order>();
  }

  async findByOrderNumber(branchId: string, orderNumber: string): Promise<Order | null> {
    return this.db
      .prepare('SELECT * FROM orders WHERE branch_id = ? AND order_number = ?')
      .bind(branchId, orderNumber)
      .first<Order>();
  }

  async listByBranch(branchId: string, limit: number = 50): Promise<Order[]> {
    const res = await this.db
      .prepare('SELECT * FROM orders WHERE branch_id = ? ORDER BY created_at DESC LIMIT ?')
      .bind(branchId, limit)
      .all<Order>();
    return res.results;
  }

  async listByCustomer(customerUserId: string, limit: number = 50): Promise<Order[]> {
    const res = await this.db
      .prepare('SELECT * FROM orders WHERE customer_user_id = ? ORDER BY created_at DESC LIMIT ?')
      .bind(customerUserId, limit)
      .all<Order>();
    return res.results;
  }

  async getOrderItems(orderId: string): Promise<OrderItem[]> {
    const res = await this.db
      .prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY created_at ASC')
      .bind(orderId)
      .all<OrderItem>();
    return res.results;
  }

  async create(input: CreateOrderInput): Promise<Order> {
    const now = new Date().toISOString();
    const status = input.status ?? OrderStatus.PENDING;
    const paymentStatus = input.payment_status ?? PaymentStatus.PENDING;
    const placedAt = input.placed_at ?? now;

    // Insert order header
    await this.db
      .prepare(`
        INSERT INTO orders (
          id, order_number, branch_id, customer_user_id, status, subtotal,
          discount, tax, total, coupon_id, offer_id, payment_status, payment_method,
          placed_at, expires_at, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        input.id,
        input.order_number,
        input.branch_id,
        input.customer_user_id,
        status,
        input.subtotal,
        input.discount ?? 0,
        input.tax ?? 0,
        input.total,
        input.coupon_id ?? null,
        input.offer_id ?? null,
        paymentStatus,
        input.payment_method ?? null,
        placedAt,
        input.expires_at,
        now,
        now,
      )
      .run();

    // Insert order items with snapshots
    for (const item of input.items) {
      await this.db
        .prepare(`
          INSERT INTO order_items (
            id, order_id, product_id, product_name_snapshot, unit_price_snapshot,
            quantity, line_discount, line_total, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          item.id,
          input.id,
          item.product_id,
          item.product_name_snapshot,
          item.unit_price_snapshot,
          item.quantity,
          item.line_discount ?? 0,
          item.line_total,
          now,
          now,
        )
        .run();
    }

    const created = await this.findById(input.id);
    if (!created) {
      throw new Error(`Failed to retrieve newly created order ${input.id}`);
    }
    return created;
  }
}
