(process.env as Record<string, string | undefined>).NODE_ENV = 'test';

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createMemoryD1Database } from '../../database/adapter.sqlite';
import { runMigrations } from '../../database/migrations/runner';
import { OrderRepository } from '../../database/repositories/order.repository';
import { PaymentRepository } from '../../database/repositories/payment.repository';
import { ProductRepository } from '../../database/repositories/product.repository';
import { AuditRepository } from '../../database/repositories/audit.repository';
import { BranchRepository } from '../../database/repositories/branch.repository';
import { InventoryRepository } from '../../database/repositories/inventory.repository';
import { PromotionRepository } from '../../database/repositories/promotion.repository';
import { OrdersService } from '../../backend/services/orders';
import { InventoryService } from '../../backend/services/inventory';
import { PromotionsService } from '../../backend/services/promotions';
import { InMemoryRealtimeService } from '../../backend/services/realtime/in-memory-realtime.service';
import { OrderStatus, PaymentMethod } from '../../shared/enums/order.enum';
import { InventoryMovementType } from '../../shared/enums/inventory.enum';
import { D1DatabaseLike } from '../../database/types';

describe('Phase 4 — Inventory & Promotions Integration Tests', () => {
  let db: D1DatabaseLike;
  let orderRepo: OrderRepository;
  let paymentRepo: PaymentRepository;
  let productRepo: ProductRepository;
  let auditRepo: AuditRepository;
  let branchRepo: BranchRepository;
  let inventoryRepo: InventoryRepository;
  let promoRepo: PromotionRepository;
  let inventoryService: InventoryService;
  let promotionsService: PromotionsService;
  let ordersService: OrdersService;
  let realtime: InMemoryRealtimeService;

  const branchId = 'branch-phase4';
  const customerId = 'user-customer-phase4';
  const operatorId = 'user-operator-phase4';
  const productId = 'prod-deluxe-sundae';
  const rawMaterialId = 'raw-milk-phase4';

  beforeEach(async () => {
    db = createMemoryD1Database();
    const migrationsDir = path.resolve(process.cwd(), 'database', 'migrations');
    await runMigrations(db, migrationsDir);

    orderRepo = new OrderRepository(db);
    paymentRepo = new PaymentRepository(db);
    productRepo = new ProductRepository(db);
    auditRepo = new AuditRepository(db);
    branchRepo = new BranchRepository(db);
    inventoryRepo = new InventoryRepository(db);
    promoRepo = new PromotionRepository(db);

    realtime = new InMemoryRealtimeService();
    inventoryService = new InventoryService(inventoryRepo, auditRepo);
    promotionsService = new PromotionsService(promoRepo, auditRepo);
    ordersService = new OrdersService(
      orderRepo,
      paymentRepo,
      productRepo,
      auditRepo,
      branchRepo,
      realtime,
      inventoryService,
      promotionsService,
    );

    const now = new Date().toISOString();
    const past = new Date(Date.now() - 3600000).toISOString();
    const future = new Date(Date.now() + 86400000 * 30).toISOString();

    // 1. Seed Branch & Settings
    await branchRepo.create({ id: branchId, name: 'Phase 4 Branch', code: 'P4B' });
    await db
      .prepare(
        `INSERT INTO branch_settings (id, branch_id, session_timeout_value, session_timeout_unit, order_expiry_minutes, order_edit_window_minutes, updated_at)
         VALUES ('bs-p4', ?, 4, 'HOURS', 15, 60, ?)`,
      )
      .bind(branchId, now)
      .run();

    // 2. Seed Users
    await db
      .prepare(
        `INSERT INTO users (id, firebase_uid, email, display_name, role, status, created_at, updated_at)
         VALUES (?, 'fb-cust-p4', 'customer-p4@melt.test', 'Phase 4 Cust', 'CUSTOMER', 'ACTIVE', ?, ?),
                (?, 'fb-op-p4', 'operator-p4@melt.test', 'Phase 4 Op', 'CUSTOMER', 'ACTIVE', ?, ?)`,
      )
      .bind(customerId, now, now, operatorId, now, now)
      .run();

    // 3. Seed Category & Product
    await db
      .prepare(`INSERT INTO categories (id, branch_id, name, active, sort_order, created_at, updated_at) VALUES ('cat-p4', ?, 'Sundaes', 1, 1, ?, ?)`)
      .bind(branchId, now, now)
      .run();

    await db
      .prepare(
        `INSERT INTO products (id, branch_id, category_id, name, description, price, active, created_at, updated_at)
         VALUES (?, ?, 'cat-p4', 'Deluxe Sundae', 'Decadent sundae', 250, 1, ?, ?)`,
      )
      .bind(productId, branchId, now, now)
      .run();

    // 4. Seed Inventory row for Product (Initial stock: 20 units)
    await db
      .prepare(
        `INSERT INTO inventory (id, branch_id, product_id, quantity, reorder_threshold, updated_at)
         VALUES ('inv-p4-prod', ?, ?, 20, 5, ?)`,
      )
      .bind(branchId, productId, now)
      .run();

    // 5. Seed Raw Material (Initial stock: 5000 ml)
    await db
      .prepare(
        `INSERT INTO raw_materials (id, branch_id, name, unit, current_quantity, reorder_threshold, active, created_at, updated_at)
         VALUES (?, ?, 'Whole Milk 5000ml', 'ml', 5000, 1000, 1, ?, ?)`,
      )
      .bind(rawMaterialId, branchId, now, now)
      .run();

    // 6. Seed Product BOM Component (1 Deluxe Sundae requires 250 ml of Whole Milk)
    await db
      .prepare(
        `INSERT INTO product_components (id, product_id, raw_material_id, quantity_required, unit)
         VALUES ('comp-p4-sundae-milk', ?, ?, 250, 'ml')`,
      )
      .bind(productId, rawMaterialId)
      .run();

    // 7. Seed Active Coupon: P4SAVE50 (Flat 50 off, min order 200, total usage limit 10)
    await db
      .prepare(
        `INSERT INTO coupons (id, branch_id, code, name, discount_type, discount_value, minimum_order_value, active, usage_count, total_usage_limit, start_at, end_at, created_at, updated_at)
         VALUES ('coupon-p4', ?, 'P4SAVE50', 'Save 50', 'FIXED', 50, 200, 1, 0, 10, ?, ?, ?, ?)`,
      )
      .bind(branchId, past, future, now, now)
      .run();
  });

  it('verifies that PENDING orders do NOT consume finished product stock, BOM raw materials, or coupon usage', async () => {
    // Check initial stock
    const initialProdInv = await inventoryRepo.findByProduct(branchId, productId);
    const initialRaw = await inventoryRepo.findRawMaterialById(rawMaterialId);
    const initialCoupon = await promoRepo.findCouponByCode(branchId, 'P4SAVE50');

    assert.strictEqual(initialProdInv?.quantity, 20);
    assert.strictEqual(initialRaw?.current_quantity, 5000);
    assert.strictEqual(initialCoupon?.usage_count, 0);

    // Create an order for 2 sundaes with coupon P4SAVE50
    const { order } = await ordersService.createOrder({
      actorUserId: customerId,
      branchId,
      customerUserId: customerId,
      items: [{ productId, quantity: 2 }],
      couponCode: 'P4SAVE50',
    });

    assert.strictEqual(order.status, OrderStatus.PENDING);
    assert.strictEqual(order.coupon_code_snapshot, 'P4SAVE50');
    assert.strictEqual(order.coupon_discount_snapshot, 50);

    // Stock & coupon usage must remain untouched while PENDING
    const prodInvAfterPending = await inventoryRepo.findByProduct(branchId, productId);
    const rawAfterPending = await inventoryRepo.findRawMaterialById(rawMaterialId);
    const couponAfterPending = await promoRepo.findCouponByCode(branchId, 'P4SAVE50');

    assert.strictEqual(prodInvAfterPending?.quantity, 20, 'Product stock must not change on order creation');
    assert.strictEqual(rawAfterPending?.current_quantity, 5000, 'Raw material stock must not change on order creation');
    assert.strictEqual(couponAfterPending?.usage_count, 0, 'Coupon usage must not increment on order creation');

    // Cancel order -> still must not consume or modify stock
    await ordersService.updateOrderStatus(operatorId, order.id, OrderStatus.CANCELLED);

    const prodInvAfterCancel = await inventoryRepo.findByProduct(branchId, productId);
    const rawAfterCancel = await inventoryRepo.findRawMaterialById(rawMaterialId);
    const couponAfterCancel = await promoRepo.findCouponByCode(branchId, 'P4SAVE50');

    assert.strictEqual(prodInvAfterCancel?.quantity, 20);
    assert.strictEqual(rawAfterCancel?.current_quantity, 5000);
    assert.strictEqual(couponAfterCancel?.usage_count, 0);
  });

  it('atomically deducts finished product stock, BOM raw materials, and records coupon usage upon order CONFIRMATION', async () => {
    // 1. Create order for 3 sundaes
    const { order } = await ordersService.createOrder({
      actorUserId: customerId,
      branchId,
      customerUserId: customerId,
      items: [{ productId, quantity: 3 }],
      couponCode: 'P4SAVE50',
    });

    // 2. Pay and verify payment
    const { payment } = await ordersService.recordPayment({
      actorUserId: operatorId,
      orderId: order.id,
      branchId,
      amount: order.total,
      method: PaymentMethod.CASH,
    });

    await ordersService.verifyPayment({
      actorUserId: operatorId,
      paymentId: payment.id,
      orderId: order.id,
      branchId,
    });

    // 3. Confirm order
    const confirmedOrder = await ordersService.confirmOrder(operatorId, order.id);
    assert.strictEqual(confirmedOrder.status, OrderStatus.CONFIRMED);

    // 4. Verify Stock Deductions:
    // Initial prod stock was 20. Order qty was 3 -> should be 17
    const prodInv = await inventoryRepo.findByProduct(branchId, productId);
    assert.strictEqual(prodInv?.quantity, 17);

    // Initial milk stock was 5000. 3 sundaes * 250ml = 750ml consumed -> should be 4250
    const rawInv = await inventoryRepo.findRawMaterialById(rawMaterialId);
    assert.strictEqual(rawInv?.current_quantity, 4250);

    // 5. Verify Coupon Usage:
    // usage_count should be 1
    const coupon = await promoRepo.findCouponByCode(branchId, 'P4SAVE50');
    assert.strictEqual(coupon?.usage_count, 1);

    // coupon_usages table entry exists
    const userUsages = await promoRepo.getUserUsageCount(coupon!.id, customerId);
    assert.strictEqual(userUsages, 1);

    // 6. Verify Inventory Movements:
    const movements = await inventoryRepo.listMovements(branchId, 20);
    assert.ok(movements.length >= 2, 'Should record movements for finished product and BOM raw material');

    const prodMovement = movements.find((m) => m.product_id === productId);
    assert.ok(prodMovement);
    assert.strictEqual(prodMovement.movement_type, InventoryMovementType.ORDER_CONSUMPTION);
    assert.strictEqual(prodMovement.quantity_delta, -3);
    assert.strictEqual(prodMovement.reference_id, order.id);

    const rawMovement = movements.find((m) => m.raw_material_id === rawMaterialId);
    assert.ok(rawMovement);
    assert.strictEqual(rawMovement.movement_type, InventoryMovementType.ORDER_CONSUMPTION);
    assert.strictEqual(rawMovement.quantity_delta, -750);
    assert.strictEqual(rawMovement.reference_id, order.id);
  });

  it('guarantees idempotency: confirming an already confirmed order does NOT double deduct stock or re-increment coupons', async () => {
    // Create, pay, confirm
    const { order } = await ordersService.createOrder({
      actorUserId: customerId,
      branchId,
      customerUserId: customerId,
      items: [{ productId, quantity: 2 }],
      couponCode: 'P4SAVE50',
    });

    const { payment } = await ordersService.recordPayment({
      actorUserId: operatorId,
      orderId: order.id,
      branchId,
      amount: order.total,
      method: PaymentMethod.CASH,
    });
    await ordersService.verifyPayment({
      actorUserId: operatorId,
      paymentId: payment.id,
      orderId: order.id,
      branchId,
    });

    await ordersService.confirmOrder(operatorId, order.id);

    // Stock after first confirmation:
    // Prod: 20 - 2 = 18
    // Raw: 5000 - 500 = 4500
    // Coupon: 1
    const p1 = await inventoryRepo.findByProduct(branchId, productId);
    const r1 = await inventoryRepo.findRawMaterialById(rawMaterialId);
    const c1 = await promoRepo.findCouponByCode(branchId, 'P4SAVE50');
    assert.strictEqual(p1?.quantity, 18);
    assert.strictEqual(r1?.current_quantity, 4500);
    assert.strictEqual(c1?.usage_count, 1);

    // Try confirming again -> rejects or stays confirmed without deducting again
    await assert.rejects(
      async () => {
        await ordersService.confirmOrder(operatorId, order.id);
      },
      (err: any) => err.message.includes('Must be PENDING'),
    );

    // Stock must be exactly unchanged
    const p2 = await inventoryRepo.findByProduct(branchId, productId);
    const r2 = await inventoryRepo.findRawMaterialById(rawMaterialId);
    const c2 = await promoRepo.findCouponByCode(branchId, 'P4SAVE50');
    assert.strictEqual(p2?.quantity, 18);
    assert.strictEqual(r2?.current_quantity, 4500);
    assert.strictEqual(c2?.usage_count, 1);
  });

  it('correctly handles confirmed order edits: quantity increase consumes delta; quantity decrease returns delta', async () => {
    // 1. Create, pay, confirm order with 2 sundaes
    const { order } = await ordersService.createOrder({
      actorUserId: customerId,
      branchId,
      customerUserId: customerId,
      items: [{ productId, quantity: 2 }],
    });

    const { payment } = await ordersService.recordPayment({
      actorUserId: operatorId,
      orderId: order.id,
      branchId,
      amount: order.total,
      method: PaymentMethod.CASH,
    });
    await ordersService.verifyPayment({
      actorUserId: operatorId,
      paymentId: payment.id,
      orderId: order.id,
      branchId,
    });
    await ordersService.confirmOrder(operatorId, order.id);

    // At this point: Prod = 18 (20-2), Raw = 4500 (5000-500)
    let prodInv = await inventoryRepo.findByProduct(branchId, productId);
    let rawInv = await inventoryRepo.findRawMaterialById(rawMaterialId);
    assert.strictEqual(prodInv?.quantity, 18);
    assert.strictEqual(rawInv?.current_quantity, 4500);

    // 2. Customer edits confirmed order: INCREASE quantity from 2 to 4 (Delta = +2)
    const editRes = await ordersService.editOrder({
      actorUserId: customerId,
      orderId: order.id,
      items: [{ productId, quantity: 4 }],
    });

    // Stock should NOT be deducted while additional payment remains pending
    prodInv = await inventoryRepo.findByProduct(branchId, productId);
    rawInv = await inventoryRepo.findRawMaterialById(rawMaterialId);
    assert.strictEqual(prodInv?.quantity, 18, 'Finished product stock remains 18 while additional payment is pending');
    assert.strictEqual(rawInv?.current_quantity, 4500, 'Raw material stock remains 4500 while additional payment is pending');
    assert.ok(editRes.additionalAmountRequired > 0, 'Additional payment must be required');

    // Record and verify the additional payment
    const { payment: addPay } = await ordersService.recordPayment({
      actorUserId: operatorId,
      orderId: order.id,
      branchId,
      amount: editRes.additionalAmountRequired,
      method: PaymentMethod.CASH,
    });
    await ordersService.verifyPayment({ actorUserId: operatorId, orderId: order.id, paymentId: addPay.id });

    // Stock is now finalized: deducted +2 finished products, +500ml raw milk
    prodInv = await inventoryRepo.findByProduct(branchId, productId);
    rawInv = await inventoryRepo.findRawMaterialById(rawMaterialId);
    assert.strictEqual(prodInv?.quantity, 16, 'Finished product stock should be 16 after payment verified');
    assert.strictEqual(rawInv?.current_quantity, 4000, 'Raw material stock should be 4000 after payment verified');

    // 3. Customer edits confirmed order: DECREASE quantity from 4 to 1 (Delta = -3)
    await ordersService.editOrder({
      actorUserId: customerId,
      orderId: order.id,
      items: [{ productId, quantity: 1 }],
    });

    // Stock should have immediately returned +3 finished products, +750ml raw milk (ORDER_REVERSAL)
    prodInv = await inventoryRepo.findByProduct(branchId, productId);
    rawInv = await inventoryRepo.findRawMaterialById(rawMaterialId);
    assert.strictEqual(prodInv?.quantity, 19, 'Finished product stock should be 19 after returning 3');
    assert.strictEqual(rawInv?.current_quantity, 4750, 'Raw material stock should be 4750 after returning 750ml');

    // Check that reversal movements were logged
    const movements = await inventoryRepo.listMovements(branchId, 20);
    const reversalMovements = movements.filter((m) => m.movement_type === InventoryMovementType.ORDER_REVERSAL);
    assert.ok(reversalMovements.length >= 2, 'Should log reversal movements for product and BOM material');
  });

  it('enforces total_usage_limit = 1 so only one order confirmation succeeds when two orders use the same coupon', async () => {
    const past = new Date(Date.now() - 3600000).toISOString();
    const future = new Date(Date.now() + 86400000).toISOString();

    // Create a special single-use coupon
    await db
      .prepare(
        `INSERT INTO coupons (id, branch_id, code, name, discount_type, discount_value, minimum_order_value, active, usage_count, total_usage_limit, start_at, end_at, created_at, updated_at)
         VALUES ('coupon-single', ?, 'ONETIME', 'Single Use', 'FIXED', 50, 200, 1, 0, 1, ?, ?, datetime('now'), datetime('now'))`,
      )
      .bind(branchId, past, future)
      .run();

    // Order 1
    const { order: order1 } = await ordersService.createOrder({
      actorUserId: customerId,
      branchId,
      customerUserId: customerId,
      items: [{ productId, quantity: 1 }],
      couponCode: 'ONETIME',
    });

    // Order 2
    const { order: order2 } = await ordersService.createOrder({
      actorUserId: customerId,
      branchId,
      customerUserId: customerId,
      items: [{ productId, quantity: 1 }],
      couponCode: 'ONETIME',
    });

    // Pay both
    const { payment: pay1 } = await ordersService.recordPayment({
      actorUserId: operatorId,
      orderId: order1.id,
      branchId,
      amount: order1.total,
      method: PaymentMethod.CASH,
    });
    await ordersService.verifyPayment({ actorUserId: operatorId, paymentId: pay1.id, orderId: order1.id, branchId });

    const { payment: pay2 } = await ordersService.recordPayment({
      actorUserId: operatorId,
      orderId: order2.id,
      branchId,
      amount: order2.total,
      method: PaymentMethod.CASH,
    });
    await ordersService.verifyPayment({ actorUserId: operatorId, paymentId: pay2.id, orderId: order2.id, branchId });

    // Confirm Order 1 -> should succeed
    const conf1 = await ordersService.confirmOrder(operatorId, order1.id);
    assert.strictEqual(conf1.status, OrderStatus.CONFIRMED);

    // Confirm Order 2 -> should fail because coupon usage limit was reached
    await assert.rejects(
      async () => {
        await ordersService.confirmOrder(operatorId, order2.id);
      },
      (err: any) => {
        return err.message.includes('Coupon usage limit reached') || err.message.includes('Confirmation failed');
      },
    );
  });
});
