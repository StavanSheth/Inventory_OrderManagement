import { BaseRepository } from './base.repository';
import { Order, OrderItem } from '../../shared/types/entities.types';
import { OrderStatus, PaymentStatus, PaymentMethod } from '../../shared/enums/order.enum';
import { D1PreparedStatementLike } from '../types';

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
  coupon_code_snapshot?: string | null;
  coupon_discount_snapshot?: number;
  offer_discount_snapshot?: number;
  payment_status?: PaymentStatus;
  payment_method?: PaymentMethod | null;
  placed_at?: string;
  expires_at: string;
  items: CreateOrderItemInput[];
}

export interface AtomicEditOrderOptions {
  orderId: string;
  branchId?: string;
  items: CreateOrderItemInput[];
  subtotal: number;
  discount?: number;
  tax: number;
  total: number;
  couponId?: string | null;
  offerId?: string | null;
  couponCodeSnapshot?: string | null;
  couponDiscountSnapshot?: number;
  offerDiscountSnapshot?: number;
  paymentStatus?: PaymentStatus;
  lastEditedAt: string;
  nowIso?: string;
  editCutoffIso: string;
  auditLog?: {
    id: string;
    branchId: string | null;
    actorUserId: string;
    action: string;
    metadata: Record<string, unknown>;
  };
  extraStatements?: D1PreparedStatementLike[];
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

  async getOrderItemsByOrderIds(orderIds: string[]): Promise<Record<string, OrderItem[]>> {
    if (orderIds.length === 0) return {};
    const placeholders = orderIds.map(() => '?').join(',');
    const res = await this.db
      .prepare(`SELECT * FROM order_items WHERE order_id IN (${placeholders}) ORDER BY created_at ASC`)
      .bind(...orderIds)
      .all<OrderItem>();
    const grouped: Record<string, OrderItem[]> = {};
    for (const item of res.results) {
      if (!grouped[item.order_id]) grouped[item.order_id] = [];
      grouped[item.order_id].push(item);
    }
    return grouped;
  }

  async countOrderHistory(options: {
    branchId?: string;
    customerUserId?: string;
    startDate?: string;
    endDate?: string;
    status?: OrderStatus;
  }): Promise<number> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.branchId) {
      conditions.push('branch_id = ?');
      params.push(options.branchId);
    }
    if (options.customerUserId) {
      conditions.push('customer_user_id = ?');
      params.push(options.customerUserId);
    }
    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }
    if (options.startDate) {
      conditions.push('placed_at >= ?');
      params.push(options.startDate);
    }
    if (options.endDate) {
      conditions.push('placed_at <= ?');
      params.push(options.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const row = await this.db
      .prepare(`SELECT COUNT(*) as count FROM orders ${whereClause}`)
      .bind(...params)
      .first<{ count: number }>();
    return row?.count ?? 0;
  }

  async listOrderHistory(options: {
    branchId?: string;
    customerUserId?: string;
    startDate?: string;
    endDate?: string;
    status?: OrderStatus;
    page?: number;
    limit?: number;
    includeItems?: boolean;
  }): Promise<Array<Order & { items?: OrderItem[] }>> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.branchId) {
      conditions.push('branch_id = ?');
      params.push(options.branchId);
    }
    if (options.customerUserId) {
      conditions.push('customer_user_id = ?');
      params.push(options.customerUserId);
    }
    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }
    if (options.startDate) {
      conditions.push('placed_at >= ?');
      params.push(options.startDate);
    }
    if (options.endDate) {
      conditions.push('placed_at <= ?');
      params.push(options.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    const offset = (page - 1) * limit;

    const res = await this.db
      .prepare(`SELECT * FROM orders ${whereClause} ORDER BY placed_at DESC LIMIT ? OFFSET ?`)
      .bind(...params, limit, offset)
      .all<Order>();

    const orders: Array<Order & { items?: OrderItem[] }> = res.results;

    if (options.includeItems && orders.length > 0) {
      for (const ord of orders) {
        ord.items = await this.getOrderItems(ord.id);
      }
    }

    return orders;
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
          placed_at, expires_at, created_at, updated_at,
          coupon_code_snapshot, coupon_discount_snapshot, offer_discount_snapshot
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        input.coupon_code_snapshot ?? null,
        input.coupon_discount_snapshot ?? 0,
        input.offer_discount_snapshot ?? 0,
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
    extra: {
      confirmed_at?: string;
      completed_at?: string;
      cancelled_at?: string;
      cancellation_reason?: string | null;
      refund_amount?: number;
      payment_status?: PaymentStatus;
    } = {},
  ): Promise<Order> {
    const now = new Date().toISOString();
    await this.db
      .prepare(`
        UPDATE orders
        SET status = ?,
            confirmed_at = COALESCE(?, confirmed_at),
            completed_at = COALESCE(?, completed_at),
            cancelled_at = COALESCE(?, cancelled_at),
            cancellation_reason = COALESCE(?, cancellation_reason),
            refund_amount = COALESCE(?, refund_amount),
            payment_status = COALESCE(?, payment_status),
            updated_at = ?
        WHERE id = ?
      `)
      .bind(
        status,
        extra.confirmed_at ?? null,
        extra.completed_at ?? null,
        extra.cancelled_at ?? null,
        extra.cancellation_reason ?? null,
        extra.refund_amount !== undefined ? extra.refund_amount : null,
        extra.payment_status ?? null,
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

  async cancelOrderWithStatements(
    orderId: string,
    extra: {
      cancelled_at: string;
      cancellation_reason?: string | null;
      refund_amount?: number;
      payment_status?: PaymentStatus;
    },
    extraStatements: D1PreparedStatementLike[] = [],
  ): Promise<Order> {
    const now = new Date().toISOString();
    const cancelStmt = this.db
      .prepare(`
        UPDATE orders
        SET status = 'CANCELLED',
            cancelled_at = ?,
            cancellation_reason = COALESCE(?, cancellation_reason),
            refund_amount = COALESCE(?, refund_amount),
            payment_status = COALESCE(?, payment_status),
            updated_at = ?
        WHERE id = ?
      `)
      .bind(
        extra.cancelled_at,
        extra.cancellation_reason ?? null,
        extra.refund_amount !== undefined ? extra.refund_amount : 0,
        extra.payment_status ?? null,
        now,
        orderId,
      );

    await this.db.batch([cancelStmt, ...extraStatements]);
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

      // Atomic counter increment with RETURNING
      const seqRow = await this.db
        .prepare(`
          INSERT INTO order_sequences (branch_id, date_str, last_seq)
          VALUES (?, ?, 1)
          ON CONFLICT(branch_id, date_str) DO UPDATE SET last_seq = order_sequences.last_seq + 1
          RETURNING last_seq
        `)
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
   * When auditLog is provided, order mutation and audit log are committed atomically together.
   */
  async confirmOrderConditionally(
    orderId: string,
    nowIso: string = new Date().toISOString(),
    auditLog?: {
      id: string;
      branchId: string | null;
      actorUserId: string;
      action: string;
      metadata: Record<string, unknown>;
    },
    extraStatements: D1PreparedStatementLike[] = [],
  ): Promise<Order> {
    const updateStmt = this.db
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
      .bind(nowIso, nowIso, orderId, nowIso);

    const stmts: D1PreparedStatementLike[] = [updateStmt, ...extraStatements];

    if (auditLog) {
      const metadataJson = JSON.stringify(auditLog.metadata ?? {});
      const auditStmt = this.db
        .prepare(`
          INSERT INTO audit_logs (
            id, branch_id, actor_user_id, actor_type, action, entity_type, entity_id,
            metadata_json, created_at
          )
          VALUES (?, ?, ?, 'USER', ?, 'order', ?, ?, ?)
        `)
        .bind(
          auditLog.id,
          auditLog.branchId,
          auditLog.actorUserId,
          auditLog.action,
          orderId,
          metadataJson,
          nowIso,
        );
      stmts.push(auditStmt);
    }

    if (stmts.length === 1) {
      const res = await updateStmt.run();
      const changes = Number((res?.meta as { changes?: number })?.changes ?? (res as { changes?: number })?.changes ?? 0);
      if (changes === 0) {
        throw new Error(`Order ${orderId} cannot be confirmed. It may already be confirmed, payment is not VERIFIED, or order has expired.`);
      }
    } else {
      const batchRes = await this.db.batch(stmts);
      for (let i = 0; i < batchRes.length; i++) {
        const changes = Number((batchRes[i]?.meta as { changes?: number })?.changes ?? (batchRes[i] as { changes?: number })?.changes ?? 0);
        if (changes === 0) {
          throw new Error(`Order ${orderId} cannot be confirmed: conditional check failed on batch statement ${i}`);
        }
      }
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
   * Records dedicated expired_at timestamp.
   */
  async expireOrderConditionally(orderId: string, nowIso: string = new Date().toISOString()): Promise<boolean> {
    const res = await this.db
      .prepare(`
        UPDATE orders
        SET status = 'EXPIRED',
            expired_at = ?,
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

  async atomicEditOrder(opts: AtomicEditOrderOptions): Promise<Order> {
    const now = opts.nowIso ?? new Date().toISOString();

    const current = await this.findById(opts.orderId);
    if (!current) {
      throw new Error(`Order ${opts.orderId} not found`);
    }
    if (['CANCELLED', 'EXPIRED', 'COMPLETED'].includes(current.status)) {
      throw new Error(`Order ${opts.orderId} cannot be edited because it is in a terminal status`);
    }
    if (current.status === OrderStatus.PENDING && new Date(current.expires_at).getTime() <= new Date(now).getTime()) {
      throw new Error(`Order ${opts.orderId} cannot be edited because it has expired`);
    }
    const orderTime = new Date(current.confirmed_at ?? current.placed_at ?? current.created_at).getTime();
    if (orderTime < new Date(opts.editCutoffIso).getTime()) {
      throw new Error(`Order ${opts.orderId} cannot be edited because the edit window has elapsed`);
    }

    // 1. Prepare delete previous items statement guarded by order edit conditions
    const deleteStmt = this.db
      .prepare(`
        DELETE FROM order_items
        WHERE order_id = ?
          AND EXISTS (
            SELECT 1 FROM orders
            WHERE id = ?
              AND (? IS NULL OR branch_id = ?)
              AND status NOT IN ('CANCELLED', 'EXPIRED', 'COMPLETED')
              AND (status != 'PENDING' OR expires_at > ?)
              AND COALESCE(confirmed_at, placed_at, created_at) >= ?
          )
      `)
      .bind(
        opts.orderId,
        opts.orderId,
        opts.branchId ?? null,
        opts.branchId ?? null,
        now,
        opts.editCutoffIso,
      );

    // 2. Prepare insert new items statements guarded by order edit conditions
    const itemStmts = opts.items.map((item) =>
      this.db
        .prepare(`
          INSERT INTO order_items (
            id, order_id, product_id, product_name_snapshot, unit_price_snapshot,
            quantity, line_discount, line_total, created_at, updated_at
          )
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM orders
            WHERE id = ?
              AND (? IS NULL OR branch_id = ?)
              AND status NOT IN ('CANCELLED', 'EXPIRED', 'COMPLETED')
              AND (status != 'PENDING' OR expires_at > ?)
              AND COALESCE(confirmed_at, placed_at, created_at) >= ?
          )
        `)
        .bind(
          item.id,
          opts.orderId,
          item.product_id,
          item.product_name_snapshot,
          item.unit_price_snapshot,
          item.quantity,
          item.line_discount ?? 0,
          item.line_total,
          now,
          now,
          opts.orderId,
          opts.branchId ?? null,
          opts.branchId ?? null,
          now,
          opts.editCutoffIso,
        ),
    );

    const shouldResetStatus = ['PREPARING', 'READY'].includes(current.status);

    // 3. Conditional update statement protecting against terminal states, expiry races, and edit window
    const updateOrderStmt = this.db
      .prepare(`
        UPDATE orders
        SET ${shouldResetStatus ? "status = 'CONFIRMED'," : ''}
            subtotal = ?,
            discount = COALESCE(?, discount),
            tax = ?,
            total = ?,
            coupon_id = CASE WHEN ? = 1 THEN ? ELSE coupon_id END,
            offer_id = CASE WHEN ? = 1 THEN ? ELSE offer_id END,
            coupon_code_snapshot = CASE WHEN ? = 1 THEN ? ELSE coupon_code_snapshot END,
            coupon_discount_snapshot = COALESCE(?, coupon_discount_snapshot),
            offer_discount_snapshot = COALESCE(?, offer_discount_snapshot),
            payment_status = COALESCE(?, payment_status),
            last_edited_at = ?,
            updated_at = ?
        WHERE id = ?
          AND (? IS NULL OR branch_id = ?)
          AND status NOT IN ('CANCELLED', 'EXPIRED', 'COMPLETED')
          AND (status != 'PENDING' OR expires_at > ?)
          AND COALESCE(confirmed_at, placed_at, created_at) >= ?
      `)
      .bind(
        opts.subtotal,
        opts.discount !== undefined ? opts.discount : null,
        opts.tax,
        opts.total,
        opts.couponId !== undefined ? 1 : 0,
        opts.couponId ?? null,
        opts.offerId !== undefined ? 1 : 0,
        opts.offerId ?? null,
        opts.couponCodeSnapshot !== undefined ? 1 : 0,
        opts.couponCodeSnapshot ?? null,
        opts.couponDiscountSnapshot !== undefined ? opts.couponDiscountSnapshot : null,
        opts.offerDiscountSnapshot !== undefined ? opts.offerDiscountSnapshot : null,
        opts.paymentStatus ?? null,
        opts.lastEditedAt,
        now,
        opts.orderId,
        opts.branchId ?? null,
        opts.branchId ?? null,
        now,
        opts.editCutoffIso,
      );

    const stmts: D1PreparedStatementLike[] = [deleteStmt, ...itemStmts, updateOrderStmt, ...(opts.extraStatements ?? [])];

    // 4. Audit statement if provided (commits in the exact same transaction, guarded by edit conditions)
    if (opts.auditLog) {
      const auditStmt = this.db
        .prepare(`
          INSERT INTO audit_logs (
            id, branch_id, actor_user_id, action, entity_type, entity_id,
            metadata_json, created_at
          )
          SELECT ?, ?, ?, ?, 'order', ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM orders
            WHERE id = ?
              AND (? IS NULL OR branch_id = ?)
              AND status NOT IN ('CANCELLED', 'EXPIRED', 'COMPLETED')
              AND (status != 'PENDING' OR expires_at > ?)
              AND COALESCE(confirmed_at, placed_at, created_at) >= ?
          )
        `)
        .bind(
          opts.auditLog.id,
          opts.auditLog.branchId,
          opts.auditLog.actorUserId,
          opts.auditLog.action,
          opts.orderId,
          JSON.stringify(opts.auditLog.metadata),
          now,
          opts.orderId,
          opts.branchId ?? null,
          opts.branchId ?? null,
          now,
          opts.editCutoffIso,
        );
      stmts.push(auditStmt);
    }

    const results = await this.db.batch(stmts);
    const updateResult = results[itemStmts.length + 1];
    const changes = Number((updateResult?.meta as { changes?: number })?.changes ?? (updateResult as { changes?: number })?.changes ?? 0);

    if (changes === 0) {
      throw new Error(`Order ${opts.orderId} cannot be edited: it may have expired, exceeded the edit window, or transitioned to a terminal status`);
    }

    const updated = await this.findById(opts.orderId);
    if (!updated) {
      throw new Error(`Order ${opts.orderId} not found`);
    }
    return updated;
  }

  async updateOrderItemsAndTotals(
    orderId: string,
    items: CreateOrderItemInput[],
    subtotal: number,
    tax: number,
    total: number,
    lastEditedAt: string,
  ): Promise<Order> {
    const now = new Date();
    const editCutoffIso = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    return this.atomicEditOrder({
      orderId,
      items,
      subtotal,
      tax,
      total,
      lastEditedAt,
      editCutoffIso,
    });
  }
}
