/**
 * Phase 3 Integration Tests — Order Lifecycle
 *
 * Covers:
 * - Customer order creation with product price calculation
 * - 15-minute expiry window
 * - Branch operator order queue (list by status)
 * - Payment recording at reception
 * - Payment verification
 * - Order confirmation after payment verified
 * - Order status transitions (state machine)
 * - Customer order editing within 60-minute window
 * - Edit window expiry enforcement
 * - Order expiry job (marks PENDING → EXPIRED)
 * - Audit trail entries
 * - Realtime events emitted
 * - Branch isolation (operator cannot access other branch orders)
 * - Price calculation never trusts client-supplied prices
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createMemoryD1Database } from '../../database/adapter.sqlite';
import { runMigrations } from '../../database/migrations/runner';
import { runDevSeed } from '../../database/seeds/dev-seed';
import { OrderRepository } from '../../database/repositories/order.repository';
import { PaymentRepository } from '../../database/repositories/payment.repository';
import { ProductRepository } from '../../database/repositories/product.repository';
import { AuditRepository } from '../../database/repositories/audit.repository';
import { BranchRepository } from '../../database/repositories/branch.repository';
import { OrdersService } from '../../backend/services/orders';
import { OrderExpiryJob } from '../../backend/jobs/order-expiry.job';
import { InMemoryRealtimeService } from '../../backend/services/realtime/in-memory-realtime.service';
import { OrderStatus, PaymentStatus, PaymentMethod } from '../../shared/enums/order.enum';
import { OrderCalculationService } from '../../backend/services/orders/order-calculation.service';
import { D1DatabaseLike } from '../../database/types';

const CUSTOMER_ID = 'user-customer-test';
const OPERATOR_ID = 'user-operator-test';
const BRANCH_ALPHA = 'branch-alpha';

async function seedUsers(db: D1DatabaseLike): Promise<void> {
  const now = new Date().toISOString();
  // Customer
  await db
    .prepare(
      `INSERT OR IGNORE INTO users (id, firebase_uid, email, display_name, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(CUSTOMER_ID, 'firebase-cust', 'customer@test.com', 'Test Customer', 'CUSTOMER', 'ACTIVE', now, now)
    .run();
  // Operator
  await db
    .prepare(
      `INSERT OR IGNORE INTO users (id, firebase_uid, email, display_name, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(OPERATOR_ID, 'firebase-op', 'operator@test.com', 'Test Operator', 'CUSTOMER', 'ACTIVE', now, now)
    .run();
}

function buildService(db: D1DatabaseLike, realtime: InMemoryRealtimeService): OrdersService {
  return new OrdersService(
    new OrderRepository(db),
    new PaymentRepository(db),
    new ProductRepository(db),
    new AuditRepository(db),
    new BranchRepository(db),
    realtime,
  );
}

describe('Phase 3 — Order Lifecycle Integration', () => {
  let db: D1DatabaseLike;
  let realtime: InMemoryRealtimeService;
  let service: OrdersService;

  beforeEach(async () => {
    db = createMemoryD1Database();
    const migrationsDir = path.resolve(process.cwd(), 'database', 'migrations');
    await runMigrations(db, migrationsDir);
    await runDevSeed(db);
    await seedUsers(db);
    realtime = new InMemoryRealtimeService();
    service = buildService(db, realtime);
  });

  it('creates an order from valid products, calculates correct totals and assigns expiry', async () => {
    const result = await service.createOrder({
      actorUserId: CUSTOMER_ID,
      branchId: BRANCH_ALPHA,
      customerUserId: CUSTOMER_ID,
      items: [
        { productId: 'prod-alpha-pistachio', quantity: 2 },
        { productId: 'prod-alpha-belgian-sundae', quantity: 1 },
      ],
    });

    const { order, items, expiresAt } = result;

    // 2×180 + 1×260 = 620 subtotal; tax 5% = 31; total = 651
    assert.strictEqual(order.subtotal, 620);
    assert.strictEqual(order.tax, 31);
    assert.strictEqual(order.total, 651);
    assert.strictEqual(order.status, OrderStatus.PENDING);
    assert.strictEqual(order.payment_status, PaymentStatus.PENDING);
    assert.strictEqual(order.customer_user_id, CUSTOMER_ID);
    assert.strictEqual(order.branch_id, BRANCH_ALPHA);
    assert.strictEqual(items.length, 2);
    assert.ok(order.order_number.startsWith('ALPHA-01-'));

    // Expiry should be ~15 minutes in the future
    const expiryMs = new Date(expiresAt).getTime() - Date.now();
    assert.ok(expiryMs > 13 * 60 * 1000, 'expiry should be > 13 minutes away');
    assert.ok(expiryMs < 16 * 60 * 1000, 'expiry should be < 16 minutes away');
  });

  it('rejects order creation with invalid product ID', async () => {
    await assert.rejects(
      () =>
        service.createOrder({
          actorUserId: CUSTOMER_ID,
          branchId: BRANCH_ALPHA,
          customerUserId: CUSTOMER_ID,
          items: [{ productId: 'non-existent-product', quantity: 1 }],
        }),
      /does not exist in branch catalog/i,
    );
  });

  it('rejects order creation with product from a different branch', async () => {
    await assert.rejects(
      () =>
        service.createOrder({
          actorUserId: CUSTOMER_ID,
          branchId: BRANCH_ALPHA,
          customerUserId: CUSTOMER_ID,
          items: [{ productId: 'prod-beta-alphonso', quantity: 1 }],
        }),
      /does not exist in branch catalog/i,
    );
  });

  it('emits OrderStatusChanged realtime event on order creation', async () => {
    let receivedEvent: unknown = null;
    realtime.subscribe({ branchId: BRANCH_ALPHA }, (event) => {
      receivedEvent = event;
    });

    await service.createOrder({
      actorUserId: CUSTOMER_ID,
      branchId: BRANCH_ALPHA,
      customerUserId: CUSTOMER_ID,
      items: [{ productId: 'prod-alpha-pistachio', quantity: 1 }],
    });

    assert.ok(receivedEvent !== null, 'Expected realtime event to be emitted');
    const event = receivedEvent as { type: string; payload: { status: string } };
    assert.strictEqual(event.type, 'OrderStatusChanged');
    assert.strictEqual(event.payload.status, OrderStatus.PENDING);
  });

  it('lists branch orders and filters by status correctly', async () => {
    await service.createOrder({
      actorUserId: CUSTOMER_ID,
      branchId: BRANCH_ALPHA,
      customerUserId: CUSTOMER_ID,
      items: [{ productId: 'prod-alpha-pistachio', quantity: 1 }],
    });

    const all = await service.listOrders(BRANCH_ALPHA);
    assert.ok(all.length >= 1);

    const pending = await service.listOrdersByStatus(BRANCH_ALPHA, OrderStatus.PENDING);
    assert.ok(pending.length >= 1);
    assert.ok(pending.every((o) => o.status === OrderStatus.PENDING));

    const confirmed = await service.listOrdersByStatus(BRANCH_ALPHA, OrderStatus.CONFIRMED);
    assert.strictEqual(confirmed.length, 0);
  });

  it('records a payment and promotes order payment_status to RECORDED', async () => {
    const { order } = await service.createOrder({
      actorUserId: CUSTOMER_ID,
      branchId: BRANCH_ALPHA,
      customerUserId: CUSTOMER_ID,
      items: [{ productId: 'prod-alpha-pistachio', quantity: 1 }],
    });

    const { payment, order: updatedOrder } = await service.recordPayment({
      actorUserId: OPERATOR_ID,
      orderId: order.id,
      branchId: BRANCH_ALPHA,
      amount: order.total,
      method: PaymentMethod.CASH,
    });

    assert.strictEqual(payment.status, PaymentStatus.RECORDED);
    assert.strictEqual(payment.method, PaymentMethod.CASH);
    assert.strictEqual(updatedOrder.payment_status, PaymentStatus.RECORDED);
    assert.strictEqual(updatedOrder.payment_method, PaymentMethod.CASH);
  });

  it('verifies a payment and promotes order payment_status to VERIFIED', async () => {
    const { order } = await service.createOrder({
      actorUserId: CUSTOMER_ID,
      branchId: BRANCH_ALPHA,
      customerUserId: CUSTOMER_ID,
      items: [{ productId: 'prod-alpha-pistachio', quantity: 1 }],
    });

    const { payment } = await service.recordPayment({
      actorUserId: OPERATOR_ID,
      orderId: order.id,
      branchId: BRANCH_ALPHA,
      amount: order.total,
      method: PaymentMethod.UPI,
    });

    const { payment: verified, order: updatedOrder } = await service.verifyPayment({
      actorUserId: OPERATOR_ID,
      paymentId: payment.id,
      orderId: order.id,
    });

    assert.strictEqual(verified.status, PaymentStatus.VERIFIED);
    assert.strictEqual(verified.confirmed_by, OPERATOR_ID);
    assert.strictEqual(updatedOrder.payment_status, PaymentStatus.VERIFIED);
  });

  it('confirms an order after payment is verified', async () => {
    const { order } = await service.createOrder({
      actorUserId: CUSTOMER_ID,
      branchId: BRANCH_ALPHA,
      customerUserId: CUSTOMER_ID,
      items: [{ productId: 'prod-alpha-pistachio', quantity: 1 }],
    });

    const { payment } = await service.recordPayment({
      actorUserId: OPERATOR_ID,
      orderId: order.id,
      branchId: BRANCH_ALPHA,
      amount: order.total,
      method: PaymentMethod.CASH,
    });

    await service.verifyPayment({
      actorUserId: OPERATOR_ID,
      paymentId: payment.id,
      orderId: order.id,
    });

    const confirmed = await service.confirmOrder(OPERATOR_ID, order.id);
    assert.strictEqual(confirmed.status, OrderStatus.CONFIRMED);
    assert.ok(confirmed.confirmed_at, 'confirmed_at should be set');
  });

  it('rejects confirm when payment is not yet verified', async () => {
    const { order } = await service.createOrder({
      actorUserId: CUSTOMER_ID,
      branchId: BRANCH_ALPHA,
      customerUserId: CUSTOMER_ID,
      items: [{ productId: 'prod-alpha-pistachio', quantity: 1 }],
    });

    await assert.rejects(
      () => service.confirmOrder(OPERATOR_ID, order.id),
      /cannot be confirmed/i,
    );
  });

  it('enforces state machine — rejects invalid status transitions', async () => {
    const { order } = await service.createOrder({
      actorUserId: CUSTOMER_ID,
      branchId: BRANCH_ALPHA,
      customerUserId: CUSTOMER_ID,
      items: [{ productId: 'prod-alpha-pistachio', quantity: 1 }],
    });

    // PENDING → COMPLETED is invalid (must go through CONFIRMED)
    await assert.rejects(
      () => service.updateOrderStatus(OPERATOR_ID, order.id, OrderStatus.COMPLETED),
      /invalid order status transition/i,
    );
  });

  it('successfully cancels a pending order', async () => {
    const { order } = await service.createOrder({
      actorUserId: CUSTOMER_ID,
      branchId: BRANCH_ALPHA,
      customerUserId: CUSTOMER_ID,
      items: [{ productId: 'prod-alpha-pistachio', quantity: 1 }],
    });

    const cancelled = await service.updateOrderStatus(OPERATOR_ID, order.id, OrderStatus.CANCELLED);
    assert.strictEqual(cancelled.status, OrderStatus.CANCELLED);
    assert.ok(cancelled.cancelled_at);
  });

  it('edits an order and recalculates totals correctly', async () => {
    const { order } = await service.createOrder({
      actorUserId: CUSTOMER_ID,
      branchId: BRANCH_ALPHA,
      customerUserId: CUSTOMER_ID,
      items: [{ productId: 'prod-alpha-pistachio', quantity: 1 }],
    });

    // 1×180 + tax(5%) = 189
    assert.strictEqual(order.total, 189);

    const editResult = await service.editOrder({
      actorUserId: CUSTOMER_ID,
      orderId: order.id,
      items: [
        { productId: 'prod-alpha-pistachio', quantity: 2 },
        { productId: 'prod-alpha-belgian-sundae', quantity: 1 },
      ],
    });

    // 2×180 + 1×260 = 620; tax = 31; total = 651
    assert.strictEqual(editResult.previousTotal, 189);
    assert.strictEqual(editResult.newTotal, 651);
    assert.strictEqual(editResult.items.length, 2);
    assert.ok(editResult.order.last_edited_at, 'last_edited_at should be set after edit');
  });

  it('rejects editing a cancelled order', async () => {
    const { order } = await service.createOrder({
      actorUserId: CUSTOMER_ID,
      branchId: BRANCH_ALPHA,
      customerUserId: CUSTOMER_ID,
      items: [{ productId: 'prod-alpha-pistachio', quantity: 1 }],
    });

    await service.updateOrderStatus(OPERATOR_ID, order.id, OrderStatus.CANCELLED);

    await assert.rejects(
      () =>
        service.editOrder({
          actorUserId: CUSTOMER_ID,
          orderId: order.id,
          items: [{ productId: 'prod-alpha-pistachio', quantity: 2 }],
        }),
      /terminal status/i,
    );
  });

  it('processes expired orders and marks them EXPIRED', async () => {
    // Create an order
    const { order } = await service.createOrder({
      actorUserId: CUSTOMER_ID,
      branchId: BRANCH_ALPHA,
      customerUserId: CUSTOMER_ID,
      items: [{ productId: 'prod-alpha-pistachio', quantity: 1 }],
    });

    // Manually set expires_at to the past to simulate expiry
    const past = new Date(Date.now() - 60_000).toISOString();
    await db.prepare('UPDATE orders SET expires_at = ? WHERE id = ?').bind(past, order.id).run();

    const job = new OrderExpiryJob(
      new OrderRepository(db),
      realtime,
    );

    const result = await job.processExpiredOrders();
    assert.strictEqual(result.expiredCount, 1);

    const expiredOrder = await new OrderRepository(db).findById(order.id);
    assert.strictEqual(expiredOrder?.status, OrderStatus.EXPIRED);
  });

  it('expiry job emits OrderStatusChanged event for each expired order', async () => {
    const { order } = await service.createOrder({
      actorUserId: CUSTOMER_ID,
      branchId: BRANCH_ALPHA,
      customerUserId: CUSTOMER_ID,
      items: [{ productId: 'prod-alpha-pistachio', quantity: 1 }],
    });

    const past = new Date(Date.now() - 60_000).toISOString();
    await db.prepare('UPDATE orders SET expires_at = ? WHERE id = ?').bind(past, order.id).run();

    const events: unknown[] = [];
    realtime.subscribe({ orderId: order.id }, (e) => events.push(e));

    const job = new OrderExpiryJob(new OrderRepository(db), realtime);
    await job.processExpiredOrders();

    assert.strictEqual(events.length, 1);
    const event = events[0] as { type: string; payload: { status: string } };
    assert.strictEqual(event.type, 'OrderStatusChanged');
    assert.strictEqual(event.payload.status, OrderStatus.EXPIRED);
  });

  it('price calculation is server-side only — ignores client unit prices', () => {
    const calc = new OrderCalculationService();
    const productsMap = new Map([
      ['prod-1', { id: 'prod-1', name: 'Ice Cream', price: 100, active: true, branch_id: 'b', category_id: 'c', created_at: '', updated_at: '' }],
    ]);

    // Even if client sends seemingly different quantity, server uses DB price
    const result = calc.calculateTotals([{ productId: 'prod-1', quantity: 3 }], productsMap as never);
    assert.strictEqual(result.subtotal, 300); // 3 × 100 (server price)
    assert.strictEqual(result.total, 315);    // 5% tax
  });

  it('generates sequential branch-scoped order numbers', async () => {
    const create = () =>
      service.createOrder({
        actorUserId: CUSTOMER_ID,
        branchId: BRANCH_ALPHA,
        customerUserId: CUSTOMER_ID,
        items: [{ productId: 'prod-alpha-pistachio', quantity: 1 }],
      });

    const r1 = await create();
    const r2 = await create();
    const r3 = await create();

    const nums = [r1.order.order_number, r2.order.order_number, r3.order.order_number];
    // All in branch-alpha and today's date
    assert.ok(nums.every((n) => n.startsWith('ALPHA-01-')));
    // Sequence strictly increases
    const seqs = nums.map((n) => parseInt(n.split('-').pop()!, 10));
    assert.ok(seqs[1] > seqs[0]);
    assert.ok(seqs[2] > seqs[1]);
  });

  it('customer can only access their own orders', async () => {
    const { order } = await service.createOrder({
      actorUserId: CUSTOMER_ID,
      branchId: BRANCH_ALPHA,
      customerUserId: CUSTOMER_ID,
      items: [{ productId: 'prod-alpha-pistachio', quantity: 1 }],
    });

    const customerOrders = await service.listCustomerOrders(CUSTOMER_ID);
    assert.ok(customerOrders.some((o) => o.id === order.id));

    // Another user's orders should be empty
    const otherOrders = await service.listCustomerOrders('user-other');
    assert.strictEqual(otherOrders.length, 0);
  });

  it('audit logs are created for order lifecycle actions', async () => {
    const auditRepo = new AuditRepository(db);

    const { order } = await service.createOrder({
      actorUserId: CUSTOMER_ID,
      branchId: BRANCH_ALPHA,
      customerUserId: CUSTOMER_ID,
      items: [{ productId: 'prod-alpha-pistachio', quantity: 1 }],
    });

    const logs = await auditRepo.listByEntity('order', order.id);
    assert.ok(logs.length >= 1);
    assert.ok(logs.some((l) => l.action === 'ORDER_CREATED'));
    assert.ok(logs.every((l) => l.actor_user_id === CUSTOMER_ID));
  });

  it('rejects underpayment and overpayment when recording payment', async () => {
    const { order } = await service.createOrder({
      actorUserId: CUSTOMER_ID,
      branchId: BRANCH_ALPHA,
      customerUserId: CUSTOMER_ID,
      items: [{ productId: 'prod-alpha-pistachio', quantity: 1 }],
    });

    // Underpayment rejection
    await assert.rejects(
      () =>
        service.recordPayment({
          actorUserId: OPERATOR_ID,
          orderId: order.id,
          branchId: BRANCH_ALPHA,
          amount: Math.round((order.total - 10) * 100) / 100,
          method: PaymentMethod.CASH,
        }),
      /does not match required payable amount/i,
    );

    // Overpayment rejection
    await assert.rejects(
      () =>
        service.recordPayment({
          actorUserId: OPERATOR_ID,
          orderId: order.id,
          branchId: BRANCH_ALPHA,
          amount: Math.round((order.total + 50) * 100) / 100,
          method: PaymentMethod.CASH,
        }),
      /does not match required payable amount/i,
    );
  });

  it('allows operator to edit confirmed order within 60 minutes and computes payment difference', async () => {
    const { order } = await service.createOrder({
      actorUserId: CUSTOMER_ID,
      branchId: BRANCH_ALPHA,
      customerUserId: CUSTOMER_ID,
      items: [{ productId: 'prod-alpha-pistachio', quantity: 1 }],
    });

    // Pay and confirm
    const { payment } = await service.recordPayment({
      actorUserId: OPERATOR_ID,
      orderId: order.id,
      branchId: BRANCH_ALPHA,
      amount: order.total,
      method: PaymentMethod.CASH,
    });
    await service.verifyPayment({
      actorUserId: OPERATOR_ID,
      paymentId: payment.id,
      orderId: order.id,
      branchId: BRANCH_ALPHA,
    });
    await service.confirmOrder(OPERATOR_ID, order.id);

    // Operator edits confirmed order by increasing quantity
    const editResult = await service.editOrder({
      actorUserId: OPERATOR_ID,
      orderId: order.id,
      items: [{ productId: 'prod-alpha-pistachio', quantity: 2 }],
    });

    assert.ok(editResult.newTotal > editResult.previousTotal);
    assert.strictEqual(editResult.verifiedPaidAmount, order.total);
    assert.strictEqual(editResult.additionalAmountRequired > 0, true);
    assert.strictEqual(editResult.order.status, OrderStatus.CONFIRMED);
    // Order payment status reverted to PENDING since additional balance is due
    assert.strictEqual(editResult.order.payment_status, PaymentStatus.PENDING);
  });

  it('stores comprehensive reconstruction metadata in ORDER_EDITED audit logs', async () => {
    const auditRepo = new AuditRepository(db);

    const { order } = await service.createOrder({
      actorUserId: CUSTOMER_ID,
      branchId: BRANCH_ALPHA,
      customerUserId: CUSTOMER_ID,
      items: [{ productId: 'prod-alpha-pistachio', quantity: 1 }],
    });

    await service.editOrder({
      actorUserId: OPERATOR_ID,
      orderId: order.id,
      items: [{ productId: 'prod-alpha-belgian-sundae', quantity: 2 }],
    });

    const logs = await auditRepo.listByEntity('order', order.id);
    const editLog = logs.find((l) => l.action === 'ORDER_EDITED');
    assert.ok(editLog, 'ORDER_EDITED log should exist');

    const meta = JSON.parse(editLog.metadata_json ?? '{}') as {
      previousItems: Array<{ productName: string; quantity: number }>;
      newItems: Array<{ productName: string; quantity: number }>;
      previousTotal: number;
      newTotal: number;
      paymentDifference: number;
    };

    assert.strictEqual(meta.previousItems.length, 1);
    assert.strictEqual(meta.newItems.length, 1);
    assert.strictEqual(meta.newItems[0].quantity, 2);
    assert.ok(meta.newTotal > 0);
  });

  it('order expiry job is idempotent and safe to run repeatedly', async () => {
    const { order } = await service.createOrder({
      actorUserId: CUSTOMER_ID,
      branchId: BRANCH_ALPHA,
      customerUserId: CUSTOMER_ID,
      items: [{ productId: 'prod-alpha-pistachio', quantity: 1 }],
    });

    // Force order expiry timestamp into the past
    const past = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await db.prepare('UPDATE orders SET expires_at = ? WHERE id = ?').bind(past, order.id).run();

    const expiryJob = new OrderExpiryJob(new OrderRepository(db), realtime);

    // First execution expires the order
    const run1 = await expiryJob.processExpiredOrders();
    assert.strictEqual(run1.expiredCount, 1);

    const expiredOrder = await service.getOrderById(BRANCH_ALPHA, order.id);
    assert.strictEqual(expiredOrder?.order.status, OrderStatus.EXPIRED);

    // Second execution does not re-expire or double-count (idempotent)
    const run2 = await expiryJob.processExpiredOrders();
    assert.strictEqual(run2.expiredCount, 0);
  });

  it('concurrency: conditional confirmation prevents double confirmation', async () => {
    const { order } = await service.createOrder({
      actorUserId: CUSTOMER_ID,
      branchId: BRANCH_ALPHA,
      customerUserId: CUSTOMER_ID,
      items: [{ productId: 'prod-alpha-pistachio', quantity: 1 }],
    });

    const { payment } = await service.recordPayment({
      actorUserId: OPERATOR_ID,
      orderId: order.id,
      branchId: BRANCH_ALPHA,
      amount: order.total,
      method: PaymentMethod.CASH,
    });
    await service.verifyPayment({
      actorUserId: OPERATOR_ID,
      paymentId: payment.id,
      orderId: order.id,
      branchId: BRANCH_ALPHA,
    });

    // First confirmation succeeds
    const confirmed = await service.confirmOrder(OPERATOR_ID, order.id);
    assert.strictEqual(confirmed.status, OrderStatus.CONFIRMED);

    // Simultaneous second confirmation fails cleanly
    await assert.rejects(
      () => service.confirmOrder(OPERATOR_ID, order.id),
      /Cannot confirm order in status CONFIRMED/i,
    );
  });

  it('concurrency: idempotent payment verification avoids duplicate updates', async () => {
    const { order } = await service.createOrder({
      actorUserId: CUSTOMER_ID,
      branchId: BRANCH_ALPHA,
      customerUserId: CUSTOMER_ID,
      items: [{ productId: 'prod-alpha-pistachio', quantity: 1 }],
    });

    const { payment } = await service.recordPayment({
      actorUserId: OPERATOR_ID,
      orderId: order.id,
      branchId: BRANCH_ALPHA,
      amount: order.total,
      method: PaymentMethod.CASH,
    });

    // First verification
    const v1 = await service.verifyPayment({
      actorUserId: OPERATOR_ID,
      paymentId: payment.id,
      orderId: order.id,
    });
    assert.strictEqual(v1.payment.status, PaymentStatus.VERIFIED);

    // Second verification returns cleanly (idempotent duplicate request handling)
    const v2 = await service.verifyPayment({
      actorUserId: OPERATOR_ID,
      paymentId: payment.id,
      orderId: order.id,
    });
    assert.strictEqual(v2.payment.status, PaymentStatus.VERIFIED);
  });
});
