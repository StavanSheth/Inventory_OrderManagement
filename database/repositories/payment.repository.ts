import { BaseRepository } from './base.repository';
import { Payment } from '../../shared/types/entities.types';
import { PaymentMethod, PaymentStatus } from '../../shared/enums/order.enum';

export interface CreatePaymentInput {
  id: string;
  order_id: string;
  branch_id: string;
  method: PaymentMethod;
  amount: number;
  status?: PaymentStatus;
  confirmed_by?: string | null;
  confirmed_at?: string | null;
}

export class PaymentRepository extends BaseRepository {
  async create(input: CreatePaymentInput): Promise<Payment> {
    const now = new Date().toISOString();
    const status = input.status ?? PaymentStatus.RECORDED;

    await this.db
      .prepare(`
        INSERT INTO payments (
          id, order_id, branch_id, method, amount, status,
          confirmed_by, confirmed_at, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        input.id,
        input.order_id,
        input.branch_id,
        input.method,
        input.amount,
        status,
        input.confirmed_by ?? null,
        input.confirmed_at ?? null,
        now,
        now,
      )
      .run();

    const created = await this.findById(input.id);
    if (!created) {
      throw new Error(`Failed to retrieve newly recorded payment ${input.id}`);
    }
    return created;
  }

  async findById(id: string): Promise<Payment | null> {
    return this.db
      .prepare('SELECT * FROM payments WHERE id = ?')
      .bind(id)
      .first<Payment>();
  }

  async listByOrder(orderId: string): Promise<Payment[]> {
    const res = await this.db
      .prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY created_at DESC')
      .bind(orderId)
      .all<Payment>();
    return res.results;
  }

  async updateStatus(
    id: string,
    status: PaymentStatus,
    confirmedByUserId?: string | null,
    confirmedAt?: string | null,
  ): Promise<Payment> {
    const now = new Date().toISOString();
    await this.db
      .prepare(`
        UPDATE payments
        SET status = ?,
            confirmed_by = COALESCE(?, confirmed_by),
            confirmed_at = COALESCE(?, confirmed_at),
            updated_at = ?
        WHERE id = ?
      `)
      .bind(status, confirmedByUserId ?? null, confirmedAt ?? null, now, id)
      .run();

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error(`Payment ${id} not found after update`);
    }
    return updated;
  }

  async recordPaymentAtomically(
    input: CreatePaymentInput,
  ): Promise<{ payment: Payment }> {
    const now = new Date().toISOString();
    const status = input.status ?? PaymentStatus.RECORDED;

    const paymentStmt = this.db
      .prepare(`
        INSERT INTO payments (
          id, order_id, branch_id, method, amount, status,
          confirmed_by, confirmed_at, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        input.id,
        input.order_id,
        input.branch_id,
        input.method,
        input.amount,
        status,
        input.confirmed_by ?? null,
        input.confirmed_at ?? null,
        now,
        now,
      );

    const orderStmt = this.db
      .prepare(`
        UPDATE orders
        SET payment_status = ?,
            payment_method = COALESCE(?, payment_method),
            updated_at = ?
        WHERE id = ?
      `)
      .bind(status, input.method, now, input.order_id);

    await this.db.batch([paymentStmt, orderStmt]);

    const created = await this.findById(input.id);
    if (!created) {
      throw new Error(`Failed to retrieve newly recorded payment ${input.id}`);
    }
    return { payment: created };
  }

  async verifyPaymentAtomically(
    paymentId: string,
    orderId: string,
    confirmedByUserId: string,
    nowIso: string = new Date().toISOString(),
  ): Promise<{ payment: Payment; wasUpdated: boolean }> {
    const paymentStmt = this.db
      .prepare(`
        UPDATE payments
        SET status = ?,
            confirmed_by = ?,
            confirmed_at = ?,
            updated_at = ?
        WHERE id = ?
          AND status = ?
      `)
      .bind(PaymentStatus.VERIFIED, confirmedByUserId, nowIso, nowIso, paymentId, PaymentStatus.RECORDED);

    const orderStmt = this.db
      .prepare(`
        UPDATE orders
        SET payment_status = ?,
            updated_at = ?
        WHERE id = ?
      `)
      .bind(PaymentStatus.VERIFIED, nowIso, orderId);

    const results = await this.db.batch([paymentStmt, orderStmt]);
    const changes = Number((results[0]?.meta as { changes?: number })?.changes ?? 0);

    const payment = await this.findById(paymentId);
    if (!payment) {
      throw new Error(`Payment ${paymentId} not found`);
    }

    return { payment, wasUpdated: changes > 0 };
  }

  async verifyPaymentConditionally(
    id: string,
    confirmedByUserId: string,
    nowIso: string = new Date().toISOString(),
  ): Promise<{ payment: Payment; wasUpdated: boolean }> {
    const res = await this.db
      .prepare(`
        UPDATE payments
        SET status = ?,
            confirmed_by = ?,
            confirmed_at = ?,
            updated_at = ?
        WHERE id = ?
          AND status = ?
      `)
      .bind(PaymentStatus.VERIFIED, confirmedByUserId, nowIso, nowIso, id, PaymentStatus.RECORDED)
      .run();

    const changes = Number((res?.meta as { changes?: number })?.changes ?? (res as { changes?: number })?.changes ?? 0);
    const payment = await this.findById(id);
    if (!payment) {
      throw new Error(`Payment ${id} not found`);
    }

    return { payment, wasUpdated: changes > 0 };
  }
}
