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

  async findByBranch(branchId: string, orderId: string): Promise<Order | null> {
    return this.db
      .prepare('SELECT * FROM orders WHERE branch_id = ? AND id = ?')
      .bind(branchId, orderId)
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

  async updateStatus(
    orderId: string,
    status: OrderStatus,
    extra: { confirmed_at?: string; completed_at?: string; cancelled_at?: string } = {},
  ): Promise<Order> {
    const now = new Date().toISOString();
    await this.db
      .prepare(`
        UPDATE orders
        SET status = ?,
            confirmed_at = COALESCE(?, confirmed_at),
            completed_at = COALESCE(?, completed_at),
            cancelled_at = COALESCE(?, cancelled_at),
            updated_at = ?
        WHERE id = ?
      `)
      .bind(
        status,
        extra.confirmed_at ?? null,
        extra.completed_at ?? null,
        extra.cancelled_at ?? null,
        now,
        orderId,
      )
      .run();

    const updated = await this.findById(orderId);
    if (!updated) {
      throw new Error(`Order ${orderId} not found`);
    }
    return updated;
  }

  async updatePaymentStatus(
    orderId: string,
    paymentStatus: PaymentStatus,
    paymentMethod?: PaymentMethod | null,
  ): Promise<Order> {
    const now = new Date().toISOString();
    await this.db
      .prepare(`
        UPDATE orders
        SET payment_status = ?,
            payment_method = COALESCE(?, payment_method),
            updated_at = ?
        WHERE id = ?
      `)
      .bind(paymentStatus, paymentMethod ?? null, now, orderId)
      .run();

    const updated = await this.findById(orderId);
    if (!updated) {
      throw new Error(`Order ${orderId} not found`);
    }
    return updated;
  }

  async findExpiredOrders(nowIso: string = new Date().toISOString()): Promise<Order[]> {
    const res = await this.db
      .prepare(`
        SELECT * FROM orders
        WHERE status = 'PENDING'
          AND expires_at <= ?
      `)
      .bind(nowIso)
      .all<Order>();
    return res.results;
  }

  async listByBranchAndStatus(
    branchId: string,
    status?: OrderStatus,
    limit: number = 50,
  ): Promise<Order[]> {
    if (status) {
      const res = await this.db
        .prepare(`
          SELECT * FROM orders
          WHERE branch_id = ? AND status = ?
          ORDER BY created_at DESC
          LIMIT ?
        `)
        .bind(branchId, status, limit)
        .all<Order>();
      return res.results;
    }
    return this.listByBranch(branchId, limit);
  }

  async generateNextOrderNumber(branchId: string, branchCode: string = 'BR'): Promise<string> {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
    const prefix = `${branchCode.toUpperCase()}-${dateStr}-`;

    const row = await this.db
      .prepare(`
        SELECT order_number
        FROM orders
        WHERE branch_id = ? AND order_number LIKE ?
        ORDER BY order_number DESC
        LIMIT 1
      `)
      .bind(branchId, `${prefix}%`)
      .first<{ order_number: string }>();

    let nextSeq = 1;
    if (row?.order_number) {
      const parts = row.order_number.split('-');
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) {
        nextSeq = lastSeq + 1;
      }
    }

    return `${prefix}${nextSeq.toString().padStart(4, '0')}`;
  }

  async updateOrderItemsAndTotals(
    orderId: string,
    items: CreateOrderItemInput[],
    subtotal: number,
    tax: number,
    total: number,
    lastEditedAt: string,
  ): Promise<Order> {
    const now = new Date().toISOString();

    // 1. Delete previous items
    await this.db.prepare('DELETE FROM order_items WHERE order_id = ?').bind(orderId).run();

    // 2. Insert new items
    for (const item of items) {
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
          orderId,
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

    // 3. Update order totals
    await this.db
      .prepare(`
        UPDATE orders
        SET subtotal = ?,
            tax = ?,
            total = ?,
            last_edited_at = ?,
            updated_at = ?
        WHERE id = ?
      `)
      .bind(subtotal, tax, total, lastEditedAt, now, orderId)
      .run();

    const updated = await this.findById(orderId);
    if (!updated) {
      throw new Error(`Order ${orderId} not found`);
    }
    return updated;
  }
}
