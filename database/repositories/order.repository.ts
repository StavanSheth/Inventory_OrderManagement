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

    // Prepare order header statement
    const orderStmt = this.db
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
      );

    // Prepare order item statements
    const itemStmts = input.items.map((item) =>
      this.db
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
        ),
    );

    // Atomically insert order header and all order items
    await this.db.batch([orderStmt, ...itemStmts]);

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

    try {
      // Ensure sequence row is seeded with max existing order if first call of the day
      const existing = await this.db
        .prepare('SELECT last_seq FROM order_sequences WHERE branch_id = ? AND date_str = ?')
        .bind(branchId, dateStr)
        .first<{ last_seq: number }>();

      if (!existing) {
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

        let initSeq = 0;
        if (row?.order_number) {
          const parts = row.order_number.split('-');
          const lastSeq = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(lastSeq)) initSeq = lastSeq;
        }

        await this.db
          .prepare(`
            INSERT INTO order_sequences (branch_id, date_str, last_seq)
            VALUES (?, ?, ?)
            ON CONFLICT(branch_id, date_str) DO NOTHING
          `)
          .bind(branchId, dateStr, initSeq)
          .run();
      }

      // Atomic counter increment
      await this.db
        .prepare(`
          INSERT INTO order_sequences (branch_id, date_str, last_seq)
          VALUES (?, ?, 1)
          ON CONFLICT(branch_id, date_str) DO UPDATE SET last_seq = last_seq + 1
        `)
        .bind(branchId, dateStr)
        .run();

      const seqRow = await this.db
        .prepare('SELECT last_seq FROM order_sequences WHERE branch_id = ? AND date_str = ?')
        .bind(branchId, dateStr)
        .first<{ last_seq: number }>();

      const nextSeq = seqRow?.last_seq ?? 1;
      return `${prefix}${nextSeq.toString().padStart(4, '0')}`;
    } catch {
      // Fallback if order_sequences is not present
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
        if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
      }
      return `${prefix}${nextSeq.toString().padStart(4, '0')}`;
    }
  }

  /**
   * Concurrency-safe atomic confirmation using conditional SQL update.
   * Succeeds only if order is PENDING, payment is VERIFIED, and order not expired.
   */
  async confirmOrderConditionally(orderId: string, nowIso: string = new Date().toISOString()): Promise<Order> {
    const res = await this.db
      .prepare(`
        UPDATE orders
        SET status = 'CONFIRMED',
            confirmed_at = ?,
            updated_at = ?
        WHERE id = ?
          AND status = 'PENDING'
          AND payment_status = 'VERIFIED'
          AND expires_at > ?
      `)
      .bind(nowIso, nowIso, orderId, nowIso)
      .run();

    const changes = Number((res?.meta as { changes?: number })?.changes ?? (res as { changes?: number })?.changes ?? 0);
    if (changes === 0) {
      throw new Error(`Order ${orderId} cannot be confirmed. It may already be confirmed, payment is not VERIFIED, or order has expired.`);
    }

    const updated = await this.findById(orderId);
    if (!updated) {
      throw new Error(`Order ${orderId} not found after confirmation`);
    }
    return updated;
  }

  /**
   * Concurrency-safe atomic expiry using conditional SQL update.
   * Only transitions if status is PENDING and expires_at <= current time.
   */
  async expireOrderConditionally(orderId: string, nowIso: string = new Date().toISOString()): Promise<boolean> {
    const res = await this.db
      .prepare(`
        UPDATE orders
        SET status = 'EXPIRED',
            cancelled_at = ?,
            updated_at = ?
        WHERE id = ?
          AND status = 'PENDING'
          AND expires_at <= ?
      `)
      .bind(nowIso, nowIso, orderId, nowIso)
      .run();

    const changes = Number((res?.meta as { changes?: number })?.changes ?? (res as { changes?: number })?.changes ?? 0);
    return changes > 0;
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

    // 1. Prepare delete previous items statement
    const deleteStmt = this.db.prepare('DELETE FROM order_items WHERE order_id = ?').bind(orderId);

    // 2. Prepare insert new items statements
    const itemStmts = items.map((item) =>
      this.db
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
        ),
    );

    // 3. Prepare update order totals statement (conditional on active/editable status)
    const updateOrderStmt = this.db
      .prepare(`
        UPDATE orders
        SET subtotal = ?,
            tax = ?,
            total = ?,
            last_edited_at = ?,
            updated_at = ?
        WHERE id = ?
          AND status NOT IN ('CANCELLED', 'EXPIRED', 'COMPLETED')
      `)
      .bind(subtotal, tax, total, lastEditedAt, now, orderId);

    // Atomically execute deletion, item insertions, and order update in a single transaction
    const results = await this.db.batch([deleteStmt, ...itemStmts, updateOrderStmt]);
    const updateResult = results[results.length - 1];
    const changes = Number((updateResult?.meta as { changes?: number })?.changes ?? (updateResult as { changes?: number })?.changes ?? 0);

    if (changes === 0) {
      throw new Error(`Order ${orderId} cannot be edited because it is in a terminal status or no longer exists`);
    }

    const updated = await this.findById(orderId);
    if (!updated) {
      throw new Error(`Order ${orderId} not found`);
    }
    return updated;
  }
}
