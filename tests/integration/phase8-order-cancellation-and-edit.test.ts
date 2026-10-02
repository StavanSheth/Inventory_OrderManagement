import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryD1Database } from '../../database/adapter.sqlite';
import { runMigrations } from '../../database/migrations/runner';
import { runDevSeed } from '../../database/seeds/dev-seed';
import { OrdersService } from '../../backend/services/orders';
import { InventoryService } from '../../backend/services/inventory';
import { OrderRepository } from '../../database/repositories/order.repository';
import { PaymentRepository } from '../../database/repositories/payment.repository';
import { InventoryRepository } from '../../database/repositories/inventory.repository';
import { ProductRepository } from '../../database/repositories/product.repository';
import { BranchRepository } from '../../database/repositories/branch.repository';
import { UserRepository } from '../../database/repositories/user.repository';
import { AuditRepository } from '../../database/repositories/audit.repository';
import { OrderStatus, PaymentStatus, PaymentMethod } from '../../shared/enums/order.enum';

test('Phase 8 — Order Cancellation & Edit Lifecycle Rules', async (t) => {
  const db = createMemoryD1Database();
  await runMigrations(db);
  await runDevSeed(db);

  const orderRepo = new OrderRepository(db);
  const paymentRepo = new PaymentRepository(db);
  const productRepo = new ProductRepository(db);
  const auditRepo = new AuditRepository(db);
  const branchRepo = new BranchRepository(db);
  const inventoryRepo = new InventoryRepository(db);
  const inventoryService = new InventoryService(inventoryRepo, auditRepo);

  const ordersService = new OrdersService(
    orderRepo,
    paymentRepo,
    productRepo,
    auditRepo,
    branchRepo,
    undefined,
    inventoryService
  );

  const branchId = 'branch-alpha';
  const customerId = 'user-customer-alpha';
  const operatorId = 'user-operator-alpha';

  const nowIso = new Date().toISOString();
  await db
    .prepare(
      `INSERT OR IGNORE INTO users (id, firebase_uid, email, display_name, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(customerId, 'fb-cust', 'cust@melt.com', 'Customer', 'CUSTOMER', 'ACTIVE', nowIso, nowIso)
    .run();
  await db
    .prepare(
      `INSERT OR IGNORE INTO users (id, firebase_uid, email, display_name, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(operatorId, 'fb-op', 'op@melt.com', 'Operator', 'CUSTOMER', 'ACTIVE', nowIso, nowIso)
    .run();

  await t.test('Customer can cancel an order in PENDING status (Payment Left)', async () => {
    const { order } = await ordersService.createOrder({
      actorUserId: customerId,
      branchId,
      customerUserId: customerId,
      items: [{ productId: 'prod-alpha-pistachio', quantity: 2 }],
    });

    assert.equal(order.status, OrderStatus.PENDING);

    const cancelled = await ordersService.customerCancelOrder(customerId, order.id, 'Changed mind');
    assert.equal(cancelled.status, OrderStatus.CANCELLED);
    assert.equal(cancelled.cancellation_reason, 'Changed mind');

    const fresh = await orderRepo.findById(order.id);
    assert.equal(fresh?.status, OrderStatus.CANCELLED);
  });

  await t.test('Customer CANNOT cancel an order once payment is done (CONFIRMED)', async () => {
    const { order } = await ordersService.createOrder({
      actorUserId: customerId,
      branchId,
      customerUserId: customerId,
      items: [{ productId: 'prod-alpha-pistachio', quantity: 1 }],
    });

    const { payment } = await ordersService.recordPayment({
      actorUserId: operatorId,
      branchId,
      orderId: order.id,
      amount: order.total,
      method: PaymentMethod.CASH,
    });

    await ordersService.verifyPayment({
      actorUserId: operatorId,
      orderId: order.id,
      paymentId: payment.id,
    });

    await ordersService.confirmOrder(operatorId, order.id);

    await assert.rejects(
      async () => {
        await ordersService.customerCancelOrder(customerId, order.id);
      },
      /Orders can only be cancelled by customer when payment is pending/
    );
  });

  await t.test('Operator can cancel at READY stage with default full refund and restock', async () => {
    const { order } = await ordersService.createOrder({
      actorUserId: customerId,
      branchId,
      customerUserId: customerId,
      items: [{ productId: 'prod-alpha-pistachio', quantity: 2 }],
    });

    const { payment } = await ordersService.recordPayment({
      actorUserId: operatorId,
      branchId,
      orderId: order.id,
      amount: order.total,
      method: PaymentMethod.UPI,
    });

    await ordersService.verifyPayment({
      actorUserId: operatorId,
      orderId: order.id,
      paymentId: payment.id,
    });

    await ordersService.confirmOrder(operatorId, order.id);

    // Advance to PREPARING then READY
    await ordersService.updateOrderStatus(operatorId, order.id, OrderStatus.PREPARING);
    await ordersService.updateOrderStatus(operatorId, order.id, OrderStatus.READY);

    // Operator cancels at READY stage with FULL refund (the default assumption)
    const cancelled = await ordersService.cancelOrder({
      actorUserId: operatorId,
      orderId: order.id,
      branchId,
      reason: 'Customer requested cancellation at counter',
      refundType: 'FULL',
      restockInventory: true,
    });

    assert.equal(cancelled.status, OrderStatus.CANCELLED);
    assert.equal(cancelled.payment_status, PaymentStatus.REFUNDED);
    assert.equal(cancelled.refund_amount, order.total);

    const fresh = await orderRepo.findById(order.id);
    assert.equal(fresh?.status, OrderStatus.CANCELLED);
    assert.equal(fresh?.refund_amount, order.total);
    assert.equal(fresh?.cancellation_reason, 'Customer requested cancellation at counter');
  });

  await t.test('Order edit before collected resets status from PREPARING/READY back to payment done (CONFIRMED)', async () => {
    const { order } = await ordersService.createOrder({
      actorUserId: customerId,
      branchId,
      customerUserId: customerId,
      items: [{ productId: 'prod-alpha-pistachio', quantity: 1 }],
    });

    const { payment } = await ordersService.recordPayment({
      actorUserId: operatorId,
      branchId,
      orderId: order.id,
      amount: order.total,
      method: PaymentMethod.CASH,
    });

    await ordersService.verifyPayment({
      actorUserId: operatorId,
      orderId: order.id,
      paymentId: payment.id,
    });

    await ordersService.confirmOrder(operatorId, order.id);

    // Transition to READY
    await ordersService.updateOrderStatus(operatorId, order.id, OrderStatus.PREPARING);
    await ordersService.updateOrderStatus(operatorId, order.id, OrderStatus.READY);

    // Operator edits before collected (e.g. customer changes flavor/quantity)
    const { order: edited } = await ordersService.editOrder({
      actorUserId: operatorId,
      orderId: order.id,
      items: [{ productId: 'prod-alpha-pistachio', quantity: 2 }],
    });

    // Must reset back to CONFIRMED (payment done stage) so kitchen can re-prepare
    assert.equal(edited.status, OrderStatus.CONFIRMED);

    const fresh = await orderRepo.findById(order.id);
    assert.equal(fresh?.status, OrderStatus.CONFIRMED);
  });

  await t.test('Order CANNOT be edited once Collected (COMPLETED)', async () => {
    const { order } = await ordersService.createOrder({
      actorUserId: customerId,
      branchId,
      customerUserId: customerId,
      items: [{ productId: 'prod-alpha-pistachio', quantity: 1 }],
    });

    const { payment } = await ordersService.recordPayment({
      actorUserId: operatorId,
      branchId,
      orderId: order.id,
      amount: order.total,
      method: PaymentMethod.CASH,
    });

    await ordersService.verifyPayment({
      actorUserId: operatorId,
      orderId: order.id,
      paymentId: payment.id,
    });

    await ordersService.confirmOrder(operatorId, order.id);

    await ordersService.updateOrderStatus(operatorId, order.id, OrderStatus.COMPLETED);

    await assert.rejects(
      async () => {
        await ordersService.editOrder({
          actorUserId: operatorId,
          orderId: order.id,
          items: [{ productId: 'prod-alpha-pistachio', quantity: 2 }],
        });
      },
      /terminal status/i
    );
  });
});
