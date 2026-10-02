import { BaseRepository } from './base.repository';
import { Payment } from '../../shared/types/entities.types';
import { PaymentMethod, PaymentStatus } from '../../shared/enums/order.enum';
import { D1PreparedStatementLike } from '../types';

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

  prepareCreateStatement(input: CreatePaymentInput, nowIso: string = new Date().toISOString()): D1PreparedStatementLike {
    const status = input.status ?? PaymentStatus.RECORDED;
    return this.db
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
        nowIso,
        nowIso,
      );
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
    auditLog?: {
      id: string;
      branchId: string | null;
      actorUserId: string;
      action: string;
      metadata: Record<string, unknown>;
    },
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
          AND status NOT IN ('CANCELLED', 'EXPIRED')
      `)
      .bind(status, input.method, now, input.order_id);

    const statements: any[] = [paymentStmt, orderStmt];

    if (auditLog) {
      const metadataJson = JSON.stringify(auditLog.metadata ?? {});
      const auditStmt = this.db
        .prepare(`
          INSERT INTO audit_logs (
            id, branch_id, actor_user_id, actor_type, action, entity_type, entity_id,
            metadata_json, created_at
          )
          VALUES (?, ?, ?, 'USER', ?, 'payment', ?, ?, ?)
        `)
        .bind(
          auditLog.id,
          auditLog.branchId,
          auditLog.actorUserId,
          auditLog.action,
          input.id,
          metadataJson,
          now,
        );
      statements.push(auditStmt);
    }

    const results = await this.db.batch(statements);
    const orderChanges = Number(
      (results[1]?.meta as { changes?: number })?.changes ?? (results[1] as { changes?: number })?.changes ?? 0,
    );

    if (orderChanges === 0) {
      throw new Error(`Order ${input.order_id} cannot accept payment because it is cancelled, expired, or not found`);
    }

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
    branchId?: string,
    auditLog?: {
      id: string;
      branchId: string | null;
      actorUserId: string;
      action: string;
      metadata: Record<string, unknown>;
    },
    extraStatements: D1PreparedStatementLike[] = [],
  ): Promise<{ payment: Payment; wasUpdated: boolean }> {
    const paymentStmt = this.db
      .prepare(`
        UPDATE payments
        SET status = ?,
            confirmed_by = ?,
            confirmed_at = ?,
            updated_at = ?
        WHERE id = ?
          AND order_id = ?
          AND status = ?
          AND (? IS NULL OR branch_id = ?)
          AND EXISTS (
            SELECT 1 FROM orders
            WHERE id = ?
              AND status NOT IN ('CANCELLED', 'EXPIRED')
              AND (status != 'PENDING' OR expires_at > ?)
              AND (
                SELECT COALESCE(SUM(p.amount), 0)
                FROM payments p
                WHERE p.order_id = payments.order_id
                  AND p.status IN ('VERIFIED', 'COMPLETED')
                  AND p.id != payments.id
              ) + payments.amount <= orders.total
          )
      `)
      .bind(
        PaymentStatus.VERIFIED,
        confirmedByUserId,
        nowIso,
        nowIso,
        paymentId,
        orderId,
        PaymentStatus.RECORDED,
        branchId ?? null,
        branchId ?? null,
        orderId,
        nowIso,
      );

    const orderStmt = this.db
      .prepare(`
        UPDATE orders
        SET payment_status = ?,
            updated_at = ?
        WHERE id = ?
          AND status NOT IN ('CANCELLED', 'EXPIRED')
          AND (status != 'PENDING' OR expires_at > ?)
      `)
      .bind(PaymentStatus.VERIFIED, nowIso, orderId, nowIso);

    const statements: any[] = [paymentStmt, orderStmt];

    if (auditLog) {
      const metadataJson = JSON.stringify(auditLog.metadata ?? {});
      const auditStmt = this.db
        .prepare(`
          INSERT INTO audit_logs (
            id, branch_id, actor_user_id, actor_type, action, entity_type, entity_id,
            metadata_json, created_at
          )
          SELECT ?, ?, ?, 'USER', ?, 'payment', ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM payments p
            JOIN orders o ON o.id = p.order_id
            WHERE p.id = ? 
              AND p.status = 'RECORDED'
              AND o.status NOT IN ('CANCELLED', 'EXPIRED')
              AND (o.status != 'PENDING' OR o.expires_at > ?)
          )
        `)
        .bind(
          auditLog.id,
          auditLog.branchId,
          auditLog.actorUserId,
          auditLog.action,
          paymentId,
          metadataJson,
          nowIso,
          paymentId,
          nowIso,
        );
      statements.push(auditStmt);
    }

    if (extraStatements && extraStatements.length > 0) {
      statements.push(...extraStatements);
    }

    const results = await this.db.batch(statements);
    const changes = Number(
      (results[0]?.meta as { changes?: number })?.changes ?? (results[0] as { changes?: number })?.changes ?? 0,
    );

    // If payment was updated, verify that all extraStatements (e.g. conditional inventory deductions) succeeded
    if (changes > 0 && extraStatements.length > 0) {
      const extraStartIndex = auditLog ? 3 : 2;
      for (let i = extraStartIndex; i < results.length; i++) {
        const stmtChanges = Number(
          (results[i]?.meta as { changes?: number })?.changes ?? (results[i] as { changes?: number })?.changes ?? 0,
        );
        if (stmtChanges === 0) {
          throw new Error(`Atomic batch verification failed: dependent inventory statement ${i - extraStartIndex} affected 0 rows`);
        }
      }
    }

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
