(process.env as Record<string, string | undefined>).NODE_ENV = 'test';

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryD1Database } from '../../database/adapter.sqlite';
import { runMigrations } from '../../database/migrations/runner';
import { OrderRepository } from '../../database/repositories/order.repository';
import { PaymentRepository } from '../../database/repositories/payment.repository';
import { ProductRepository } from '../../database/repositories/product.repository';
import { AuditRepository } from '../../database/repositories/audit.repository';
import { BranchRepository } from '../../database/repositories/branch.repository';
import { UserRepository } from '../../database/repositories/user.repository';
import { OrdersService } from '../../backend/services/orders';
import { OrderExpiryJob } from '../../backend/jobs/order-expiry.job';
import { InMemoryRealtimeService } from '../../backend/services/realtime/in-memory-realtime.service';
import { OrderStatus, PaymentStatus, PaymentMethod } from '../../shared/enums/order.enum';
import { BranchStatus } from '../../shared/enums/branch.enum';
import { UserRole } from '../../shared/enums/roles.enum';
import { D1DatabaseLike } from '../../database/types';

describe('Phase 3 — Database Atomicity & Audit Tests', () => {
  let db: D1DatabaseLike;
  let orderRepo: OrderRepository;
  let paymentRepo: PaymentRepository;
  let auditRepo: AuditRepository;
  let ordersService: OrdersService;
  let expiryJob: OrderExpiryJob;

  beforeEach(async () => {
    db = createMemoryD1Database();
    await runMigrations(db);

    orderRepo = new OrderRepository(db);
    paymentRepo = new PaymentRepository(db);
    auditRepo = new AuditRepository(db);
    const branchRepo = new BranchRepository(db);
    const productRepo = new ProductRepository(db);
    const userRepo = new UserRepository(db);
    const realtime = new InMemoryRealtimeService();

    ordersService = new OrdersService(
      orderRepo,
      paymentRepo,
      productRepo,
      auditRepo,
      branchRepo,
      realtime,
    );

    expiryJob = new OrderExpiryJob(orderRepo, realtime, auditRepo);

    await userRepo.create({ id: 'usr-cust', firebase_uid: 'fb-cust', email: 'cust@melt.local', display_name: 'Customer', role: UserRole.CUSTOMER });
    await userRepo.create({ id: 'usr-op', firebase_uid: 'fb-op', email: 'op@melt.local', display_name: 'Operator', role: UserRole.CUSTOMER });

    await branchRepo.create({ id: 'branch-alpha', name: 'Branch Alpha', code: 'ALPHA', status: BranchStatus.ACTIVE });
    await productRepo.createCategory({ id: 'cat-scoops', branch_id: 'branch-alpha', name: 'Scoops', active: true, sort_order: 1 });
    await productRepo.create({ id: 'prod-1', branch_id: 'branch-alpha', category_id: 'cat-scoops', name: 'Vanilla', price: 100, active: true });
    await productRepo.create({ id: 'prod-2', branch_id: 'branch-alpha', category_id: 'cat-scoops', name: 'Chocolate', price: 150, active: true });
  });

  describe('Order Creation Atomicity', () => {
    it('creates order and all line items atomically in a single batch', async () => {
      const res = await ordersService.createOrder({
        actorUserId: 'usr-cust',
        customerUserId: 'usr-cust',
        branchId: 'branch-alpha',
        items: [
          { productId: 'prod-1', quantity: 2 },
          { productId: 'prod-2', quantity: 1 },
        ],
      });

      const order = await orderRepo.findById(res.order.id);
      assert.ok(order);
      const items = await orderRepo.getOrderItems(res.order.id);
      assert.strictEqual(items.length, 2);
    });

    it('rolls back completely if batch execution fails', async () => {
      const badOrderRepo = new OrderRepository(db);
      // Attempt to create order with duplicate item ID causing primary key conflict
      const orderId = 'ord-fail-atomic';
      try {
        await badOrderRepo.create({
          id: orderId,
          order_number: 'ALPHA-FAIL-001',
          branch_id: 'branch-alpha',
          customer_user_id: 'usr-cust',
          subtotal: 100,
          total: 105,
          expires_at: new Date(Date.now() + 900000).toISOString(),
          items: [
            {
              id: 'item-duplicate',
              product_id: 'prod-1',
              product_name_snapshot: 'Vanilla',
              unit_price_snapshot: 100,
              quantity: 1,
              line_total: 100,
            },
            {
              id: 'item-duplicate', // Duplicate ID triggers UNIQUE constraint violation in batch
              product_id: 'prod-2',
              product_name_snapshot: 'Chocolate',
              unit_price_snapshot: 150,
              quantity: 1,
              line_total: 150,
            },
          ],
        });
        assert.fail('Should have failed due to duplicate primary key');
      } catch {
        // Verify order header was NOT left behind
        const header = await orderRepo.findById(orderId);
        assert.strictEqual(header, null, 'Order header must not exist if items insertion failed');
      }
    });
  });

  describe('Order Edit Atomicity', () => {
    it('replaces items and updates totals atomically in a single batch', async () => {
      const created = await ordersService.createOrder({
        actorUserId: 'usr-cust',
        customerUserId: 'usr-cust',
        branchId: 'branch-alpha',
        items: [{ productId: 'prod-1', quantity: 1 }],
      });

      const edited = await ordersService.editOrder({
        actorUserId: 'usr-op',
        orderId: created.order.id,
        items: [{ productId: 'prod-2', quantity: 3 }],
      });

      assert.strictEqual(edited.newTotal, 472.5); // 3 * 150 + 5% = 472.5
      const items = await orderRepo.getOrderItems(created.order.id);
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].product_id, 'prod-2');
      assert.strictEqual(items[0].quantity, 3);
    });

    it('failed atomic edit leaves original items, totals, and audit logs completely untouched', async () => {
      // 1. Create order with Item A (prod-1)
      const created = await ordersService.createOrder({
        actorUserId: 'usr-cust',
        customerUserId: 'usr-cust',
        branchId: 'branch-alpha',
        items: [{ productId: 'prod-1', quantity: 2 }],
      });

      const originalOrder = await orderRepo.findById(created.order.id);
      assert.ok(originalOrder);
      const originalSubtotal = originalOrder.subtotal;
      const originalTotal = originalOrder.total;
      const originalPaymentStatus = originalOrder.payment_status;

      // Force the order to become non-editable immediately before the mutation
      await db
        .prepare("UPDATE orders SET status = 'CANCELLED' WHERE id = ?")
        .bind(created.order.id)
        .run();

      // 2. Attempt to edit the order with Item B (prod-2) directly via atomicEditOrder
      const now = new Date();
      await assert.rejects(
        async () => {
          await orderRepo.atomicEditOrder({
            orderId: created.order.id,
            branchId: 'branch-alpha',
            items: [
              {
                id: 'item-b-should-not-exist',
                product_id: 'prod-2',
                product_name_snapshot: 'Chocolate',
                unit_price_snapshot: 150,
                quantity: 5,
                line_total: 750,
              },
            ],
            subtotal: 750,
            tax: 37.5,
            total: 787.5,
            paymentStatus: PaymentStatus.RECORDED,
            lastEditedAt: now.toISOString(),
            editCutoffIso: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
            auditLog: {
              id: 'aud-should-not-exist',
              branchId: 'branch-alpha',
              actorUserId: 'usr-op',
              action: 'ORDER_EDITED',
              metadata: { attempt: 'failed_edit' },
            },
          });
        },
        /cannot be edited/i,
      );

      // 3. Verify original item A still exists and item B does not exist
      const items = await orderRepo.getOrderItems(created.order.id);
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].product_id, 'prod-1');
      assert.strictEqual(items[0].quantity, 2);

      const itemB = items.find((i) => i.product_id === 'prod-2');
      assert.strictEqual(itemB, undefined, 'Item B must not exist');

      // 4. Verify original subtotal, total, and payment status are unchanged
      const currentOrder = await orderRepo.findById(created.order.id);
      assert.strictEqual(currentOrder?.subtotal, originalSubtotal);
      assert.strictEqual(currentOrder?.total, originalTotal);
      assert.strictEqual(currentOrder?.payment_status, originalPaymentStatus);

      // 5. Verify no ORDER_EDITED success audit exists
      const audits = await auditRepo.listByEntity('order', created.order.id);
      const editAudit = audits.find((a) => a.action === 'ORDER_EDITED');
      assert.strictEqual(editAudit, undefined, 'No ORDER_EDITED success audit record must exist');
    });
  });

  describe('Payment Atomicity', () => {
    it('records payment and updates order payment_status atomically', async () => {
      const created = await ordersService.createOrder({
        actorUserId: 'usr-cust',
        customerUserId: 'usr-cust',
        branchId: 'branch-alpha',
        items: [{ productId: 'prod-1', quantity: 1 }],
      });

      const { payment, order } = await ordersService.recordPayment({
        actorUserId: 'usr-op',
        branchId: 'branch-alpha',
        orderId: created.order.id,
        amount: 105,
        method: PaymentMethod.CASH,
      });

      assert.strictEqual(payment.status, PaymentStatus.RECORDED);
      assert.strictEqual(order.payment_status, PaymentStatus.RECORDED);

      const dbOrder = await orderRepo.findById(created.order.id);
      assert.strictEqual(dbOrder?.payment_status, PaymentStatus.RECORDED);
    });

    it('verifies payment and updates order payment_status atomically', async () => {
      const created = await ordersService.createOrder({
        actorUserId: 'usr-cust',
        customerUserId: 'usr-cust',
        branchId: 'branch-alpha',
        items: [{ productId: 'prod-1', quantity: 1 }],
      });

      const { payment } = await ordersService.recordPayment({
        actorUserId: 'usr-op',
        branchId: 'branch-alpha',
        orderId: created.order.id,
        amount: 105,
        method: PaymentMethod.CASH,
      });

      const { payment: verifiedPayment, order: verifiedOrder } = await ordersService.verifyPayment({
        actorUserId: 'usr-op',
        branchId: 'branch-alpha',
        orderId: created.order.id,
        paymentId: payment.id,
      });

      assert.strictEqual(verifiedPayment.status, PaymentStatus.VERIFIED);
      assert.strictEqual(verifiedOrder.payment_status, PaymentStatus.VERIFIED);

      const dbOrder = await orderRepo.findById(created.order.id);
      assert.strictEqual(dbOrder?.payment_status, PaymentStatus.VERIFIED);
    });
  });

  describe('Audit Trail: ORDER_EXPIRED and ORDER_CANCELLED', () => {
    it('writes ORDER_EXPIRED audit log with complete metadata on order expiry', async () => {
      // 1. Create order with past expiry
      const order = await orderRepo.create({
        id: 'ord-expired-test',
        order_number: 'ALPHA-20261002-9999',
        branch_id: 'branch-alpha',
        customer_user_id: 'usr-cust',
        subtotal: 100,
        total: 105,
        expires_at: new Date(Date.now() - 60000).toISOString(), // expired 1 minute ago
        items: [{
          id: 'item-exp-1',
          product_id: 'prod-1',
          product_name_snapshot: 'Vanilla',
          unit_price_snapshot: 100,
          quantity: 1,
          line_total: 100,
        }],
      });

      const result = await expiryJob.processExpiredOrders();
      assert.strictEqual(result.expiredCount, 1);

      // Check audit log
      const logs = await auditRepo.listByEntity('order', order.id);
      const expiryLog = logs.find((l) => l.action === 'ORDER_EXPIRED');
      assert.ok(expiryLog, 'ORDER_EXPIRED audit log must be recorded');
      assert.strictEqual(expiryLog.actor_type, 'SYSTEM');
      assert.strictEqual(expiryLog.actor_user_id, null);

      const meta = JSON.parse(expiryLog.metadata_json ?? '{}') as {
        orderNumber: string;
        previousStatus: string;
        newStatus: string;
        actor: string;
        systemSource: string;
      };
      assert.strictEqual(meta.actor, 'system');
      assert.strictEqual(meta.systemSource, 'cron_expiry');
      assert.strictEqual(meta.orderNumber, 'ALPHA-20261002-9999');
      assert.strictEqual(meta.previousStatus, 'PENDING');
      assert.strictEqual(meta.newStatus, 'EXPIRED');
      assert.strictEqual(meta.actor, 'system');
    });

    it('writes ORDER_CANCELLED audit log when order is cancelled', async () => {
      const created = await ordersService.createOrder({
        actorUserId: 'usr-cust',
        customerUserId: 'usr-cust',
        branchId: 'branch-alpha',
        items: [{ productId: 'prod-1', quantity: 1 }],
      });

      await ordersService.updateOrderStatus('usr-op', created.order.id, OrderStatus.CANCELLED);

      const logs = await auditRepo.listByEntity('order', created.order.id);
      const cancelLog = logs.find((l) => l.action === 'ORDER_CANCELLED');
      assert.ok(cancelLog, 'ORDER_CANCELLED audit log must be recorded');
      assert.strictEqual(cancelLog.actor_user_id, 'usr-op');
    });
  });
});
