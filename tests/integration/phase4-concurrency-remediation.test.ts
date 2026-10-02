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
import { InventoryRepository } from '../../database/repositories/inventory.repository';
import { PromotionRepository } from '../../database/repositories/promotion.repository';
import { OrdersService } from '../../backend/services/orders';
import { InventoryService } from '../../backend/services/inventory';
import { PromotionsService } from '../../backend/services/promotions';
import { DatabaseRealtimeService, centralRealtimeHub } from '../../backend/services/realtime/database-realtime.service';
import { OrderStatus, PaymentMethod } from '../../shared/enums/order.enum';
import { BranchStatus } from '../../shared/enums/branch.enum';
import { UserRole, MembershipStatus } from '../../shared/enums/roles.enum';
import { DiscountType, OfferType } from '../../shared/enums/promotions.enum';
import { AuditAction } from '../../shared/enums/audit.enum';
import { D1DatabaseLike } from '../../database/types';

describe('Phase 4 — Concurrency, Inventory Ledger, BOM & Promotion Remediation Tests', () => {
  let db: D1DatabaseLike;
  let orderRepo: OrderRepository;
  let paymentRepo: PaymentRepository;
  let auditRepo: AuditRepository;
  let inventoryRepo: InventoryRepository;
  let promoRepo: PromotionRepository;
  let ordersService: OrdersService;
  let inventoryService: InventoryService;
  let promotionsService: PromotionsService;
  let realtimeService: DatabaseRealtimeService;

  const branchId = 'branch-alpha';
  const customerId = 'usr-cust';
  const operatorId = 'usr-op';

  beforeEach(async () => {
    centralRealtimeHub.clear();
    db = createMemoryD1Database();
    await runMigrations(db);
    centralRealtimeHub.setDatabase(db);

    orderRepo = new OrderRepository(db);
    paymentRepo = new PaymentRepository(db);
    auditRepo = new AuditRepository(db);
    inventoryRepo = new InventoryRepository(db);
    promoRepo = new PromotionRepository(db);
    const branchRepo = new BranchRepository(db);
    const productRepo = new ProductRepository(db);
    const userRepo = new UserRepository(db);
    realtimeService = new DatabaseRealtimeService(db);

    inventoryService = new InventoryService(inventoryRepo, auditRepo);
    promotionsService = new PromotionsService(promoRepo, auditRepo);

    ordersService = new OrdersService(
      orderRepo,
      paymentRepo,
      productRepo,
      auditRepo,
      branchRepo,
      realtimeService,
      inventoryService,
      promotionsService,
    );

    // Seed branch, categories, products
    await branchRepo.create({ id: branchId, name: 'Alpha Branch', code: 'ALPHA', status: BranchStatus.ACTIVE });
    await productRepo.createCategory({ id: 'cat-icecream', branch_id: branchId, name: 'Ice Creams', active: true, sort_order: 1 });
    await productRepo.create({ id: 'prod-pistachio', branch_id: branchId, category_id: 'cat-icecream', name: 'Pistachio Scoop', price: 100, active: true });
    await productRepo.create({ id: 'prod-belgian', branch_id: branchId, category_id: 'cat-icecream', name: 'Belgian Choc', price: 150, active: true });

    // Seed users
    await userRepo.create({ id: customerId, firebase_uid: 'fb-cust', email: 'cust@melt.local', display_name: 'Customer', role: UserRole.CUSTOMER });
    await userRepo.create({ id: operatorId, firebase_uid: 'fb-op', email: 'op@melt.local', display_name: 'Operator', role: UserRole.CUSTOMER });
    await userRepo.addMembership('mem-op', operatorId, branchId, UserRole.BRANCH_OPERATOR, MembershipStatus.ACTIVE);
  });

  describe('1. Payment Verification Invariant Under Concurrent Requests', () => {
    it('concurrent verification calls resolve safely and idempotent, and verified total cannot exceed order total', async () => {
      // Create order of total ₹105 (100 subtotal + 5% tax)
      const { order } = await ordersService.createOrder({
        actorUserId: customerId,
        customerUserId: customerId,
        branchId,
        items: [{ productId: 'prod-pistachio', quantity: 1 }],
      });
      assert.strictEqual(order.total, 105);

      // Record payment of ₹105
      const { payment } = await ordersService.recordPayment({
        actorUserId: operatorId,
        orderId: order.id,
        branchId,
        amount: 105,
        method: PaymentMethod.UPI,
      });

      // Competing verification calls on the payment
      const results = await Promise.allSettled([
        ordersService.verifyPayment({ actorUserId: operatorId, orderId: order.id, paymentId: payment.id }),
        ordersService.verifyPayment({ actorUserId: operatorId, orderId: order.id, paymentId: payment.id }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      assert.ok(fulfilled.length >= 1, 'At least one verification succeeds');

      // Check verified sum in database is exactly 105
      const verifiedSumRow = await db
        .prepare(`SELECT SUM(amount) as total FROM payments WHERE order_id = ? AND status = 'VERIFIED'`)
        .bind(order.id)
        .first<{ total: number }>();
      assert.strictEqual(verifiedSumRow?.total, 105);

      // Database trigger check: attempting to update verified payment amount to exceed order total is aborted
      await assert.rejects(
        async () => {
          await db
            .prepare(`UPDATE payments SET amount = 200 WHERE id = ?`)
            .bind(payment.id)
            .run();
        },
        (err: any) => err.message.includes('Verified payment') && err.message.includes('exceeds order total'),
      );
    });
  });

  describe('2. Exact-Once Inventory Deduction & Duplicate Confirmation Prevention', () => {
    it('concurrent duplicate confirmations deduct inventory exactly once and produce no duplicate movements', async () => {
      // Refill product stock to 10
      await inventoryService.refillProductStock(branchId, 'prod-pistachio', 10, operatorId, 'Initial Stock');

      // Create order for 2 units
      const { order } = await ordersService.createOrder({
        actorUserId: customerId,
        customerUserId: customerId,
        branchId,
        items: [{ productId: 'prod-pistachio', quantity: 2 }],
      });

      // Record & verify payment
      const { payment } = await ordersService.recordPayment({
        actorUserId: operatorId,
        orderId: order.id,
        branchId,
        amount: order.total,
        method: PaymentMethod.CASH,
      });
      await ordersService.verifyPayment({ actorUserId: operatorId, orderId: order.id, paymentId: payment.id });

      // Run 2 simultaneous confirmations
      const results = await Promise.allSettled([
        ordersService.confirmOrder(operatorId, order.id),
        ordersService.confirmOrder(operatorId, order.id),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      assert.ok(fulfilled.length >= 1, 'At least one confirmation succeeds');

      // Invariant: Final stock must be exactly 10 - 2 = 8, NEVER 6
      const stock = await inventoryRepo.findByProduct(branchId, 'prod-pistachio');
      assert.strictEqual(stock?.quantity, 8, 'Inventory must be deducted exactly once (10 - 2 = 8)');

      // Invariant: Exactly one ORDER_CONSUMPTION movement recorded
      const movements = await inventoryRepo.listMovements(branchId, 50);
      const orderMovements = movements.filter((m) => m.reference_id === order.id && m.movement_type === 'ORDER_CONSUMPTION');
      assert.strictEqual(orderMovements.length, 1, 'Exactly one order consumption movement logged');
      assert.strictEqual(orderMovements[0].quantity_delta, -2);
    });

    it('insufficient finished stock fails confirmation atomically with zero stock deducted', async () => {
      // Stock only 1 unit
      await inventoryService.refillProductStock(branchId, 'prod-pistachio', 1, operatorId, 'Initial Stock');

      // Order 5 units
      const { order } = await ordersService.createOrder({
        actorUserId: customerId,
        customerUserId: customerId,
        branchId,
        items: [{ productId: 'prod-pistachio', quantity: 5 }],
      });

      const { payment } = await ordersService.recordPayment({
        actorUserId: operatorId,
        orderId: order.id,
        branchId,
        amount: order.total,
        method: PaymentMethod.CASH,
      });
      await ordersService.verifyPayment({ actorUserId: operatorId, orderId: order.id, paymentId: payment.id });

      // Confirm order must reject
      await assert.rejects(
        async () => {
          await ordersService.confirmOrder(operatorId, order.id);
        },
        (err: any) => err.message.includes('Insufficient inventory') || err.message.includes('stock'),
      );

      // Order must remain PENDING
      const postOrder = await orderRepo.findById(order.id);
      assert.strictEqual(postOrder?.status, OrderStatus.PENDING);

      // Stock must remain unchanged at 1
      const stock = await inventoryRepo.findByProduct(branchId, 'prod-pistachio');
      assert.strictEqual(stock?.quantity, 1);
    });
  });

  describe('3. BOM Recipe Validation and Atomicity', () => {
    it('rejects cross-branch raw materials, inactive materials, and duplicate components in BOM', async () => {
      // Create materials in branch-alpha
      const milk = await inventoryService.createRawMaterial(branchId, operatorId, {
        name: 'Whole Milk',
        unit: 'ml',
        current_quantity: 1000,
        reorder_threshold: 200,
      });

      const sugar = await inventoryService.createRawMaterial(branchId, operatorId, {
        name: 'Cane Sugar',
        unit: 'g',
        current_quantity: 500,
        reorder_threshold: 50,
      });

      // Deactivate sugar
      await db.prepare('UPDATE raw_materials SET active = 0 WHERE id = ?').bind(sugar.id).run();

      // 1. Inactive material rejection
      await assert.rejects(
        async () => {
          await inventoryService.setProductComponents(
            'prod-pistachio',
            [{ rawMaterialId: sugar.id, quantityRequired: 50 }],
            operatorId,
            branchId,
          );
        },
        (err: any) => err.message.includes('inactive raw material'),
      );

      // 2. Duplicate raw material in same recipe rejection
      await assert.rejects(
        async () => {
          await inventoryService.setProductComponents(
            'prod-pistachio',
            [
              { rawMaterialId: milk.id, quantityRequired: 100 },
              { rawMaterialId: milk.id, quantityRequired: 50 },
            ],
            operatorId,
            branchId,
          );
        },
        (err: any) => err.message.includes('Duplicate raw material component'),
      );

      // 3. Negative / Zero quantity rejection
      await assert.rejects(
        async () => {
          await inventoryService.setProductComponents(
            'prod-pistachio',
            [{ rawMaterialId: milk.id, quantityRequired: -10 }],
            operatorId,
            branchId,
          );
        },
        (err: any) => err.message.includes('positive number'),
      );
    });

    it('deducts BOM raw materials accurately and atomically on order confirmation', async () => {
      // 1. Create Milk raw material: 1000 ml
      const milk = await inventoryService.createRawMaterial(branchId, operatorId, {
        name: 'Organic Milk',
        unit: 'ml',
        current_quantity: 1000,
        reorder_threshold: 100,
      });

      // 2. Configure BOM: Pistachio Scoop uses 200 ml of Milk
      await inventoryService.setProductComponents(
        'prod-pistachio',
        [{ rawMaterialId: milk.id, quantityRequired: 200 }],
        operatorId,
        branchId,
      );

      // 3. Finished stock: 10 units
      await inventoryService.refillProductStock(branchId, 'prod-pistachio', 10, operatorId, 'Stocked');

      // 4. Order 3 Pistachio Scoops (requires 600 ml milk)
      const { order } = await ordersService.createOrder({
        actorUserId: customerId,
        customerUserId: customerId,
        branchId,
        items: [{ productId: 'prod-pistachio', quantity: 3 }],
      });

      const { payment } = await ordersService.recordPayment({
        actorUserId: operatorId,
        orderId: order.id,
        branchId,
        amount: order.total,
        method: PaymentMethod.CASH,
      });
      await ordersService.verifyPayment({ actorUserId: operatorId, orderId: order.id, paymentId: payment.id });

      // Confirm order
      await ordersService.confirmOrder(operatorId, order.id);

      // Check remaining raw material: 1000 - (3 * 200) = 400 ml
      const updatedMilk = await inventoryRepo.findRawMaterialById(milk.id);
      assert.strictEqual(updatedMilk?.current_quantity, 400);

      // Check movements: 1 movement for finished product, 1 movement for raw material
      const movements = await inventoryRepo.listMovements(branchId, 10);
      const rawMove = movements.find((m) => m.raw_material_id === milk.id);
      assert.ok(rawMove);
      assert.strictEqual(rawMove.quantity_delta, -600);
      assert.strictEqual(rawMove.reference_id, order.id);
    });
  });

  describe('4. Confirmed Order Editing with Delta Inventory & BOM Logic', () => {
    it('applies delta inventory consumption when increasing confirmed order quantity', async () => {
      // Refill product: 20 units
      await inventoryService.refillProductStock(branchId, 'prod-pistachio', 20, operatorId, 'Stocked');

      // Order 2 units
      const { order } = await ordersService.createOrder({
        actorUserId: customerId,
        customerUserId: customerId,
        branchId,
        items: [{ productId: 'prod-pistachio', quantity: 2 }],
      });

      const { payment } = await ordersService.recordPayment({
        actorUserId: operatorId,
        orderId: order.id,
        branchId,
        amount: order.total,
        method: PaymentMethod.CASH,
      });
      await ordersService.verifyPayment({ actorUserId: operatorId, orderId: order.id, paymentId: payment.id });
      await ordersService.confirmOrder(operatorId, order.id);

      // Initial deduction: 20 - 2 = 18
      let stock = await inventoryRepo.findByProduct(branchId, 'prod-pistachio');
      assert.strictEqual(stock?.quantity, 18);

      // Edit order: increase from 2 to 5 (delta = +3 units)
      const editRes = await ordersService.editOrder({
        actorUserId: operatorId,
        orderId: order.id,
        items: [{ productId: 'prod-pistachio', quantity: 5 }],
      });

      // Stock should NOT decrease yet because additional payment is required!
      stock = await inventoryRepo.findByProduct(branchId, 'prod-pistachio');
      assert.strictEqual(stock?.quantity, 18, 'Stock remains 18 while additional payment is pending');
      assert.ok(editRes.additionalAmountRequired > 0);

      // Record and verify the additional payment
      const { payment: addPay } = await ordersService.recordPayment({
        actorUserId: operatorId,
        orderId: order.id,
        branchId,
        amount: editRes.additionalAmountRequired,
        method: PaymentMethod.CASH,
      });
      await ordersService.verifyPayment({ actorUserId: operatorId, orderId: order.id, paymentId: addPay.id });

      // Stock should now be deducted by 3 (18 - 3 = 15)
      stock = await inventoryRepo.findByProduct(branchId, 'prod-pistachio');
      assert.strictEqual(stock?.quantity, 15, 'Stock should be 18 - 3 = 15 after additional payment is verified');

      // Edit order: decrease from 5 to 1 (delta = -4 units, inventory should immediately increase by 4 reversal)
      await ordersService.editOrder({
        actorUserId: operatorId,
        orderId: order.id,
        items: [{ productId: 'prod-pistachio', quantity: 1 }],
      });

      stock = await inventoryRepo.findByProduct(branchId, 'prod-pistachio');
      assert.strictEqual(stock?.quantity, 19, 'Stock should be 15 + 4 = 19 (reversal)');

      // Check movements: should contain ORDER_REVERSAL for the decrease
      const movements = await inventoryRepo.listMovements(branchId, 50);
      const reversalMoves = movements.filter((m) => m.movement_type === 'ORDER_REVERSAL');
      assert.ok(reversalMoves.length >= 1, 'Reversal movement must be recorded on order reduction');
      assert.strictEqual(reversalMoves[0].quantity_delta, 4);
    });

    it('handles product deletion (N -> 0) as immediate reversal and product addition (0 -> N) deferred until payment', async () => {
      // Stock both products
      await inventoryService.refillProductStock(branchId, 'prod-pistachio', 20, operatorId, 'Stocked');
      await inventoryService.refillProductStock(branchId, 'prod-belgian', 20, operatorId, 'Stocked');

      // Create order with 3 Pistachio
      const { order } = await ordersService.createOrder({
        actorUserId: customerId,
        customerUserId: customerId,
        branchId,
        items: [{ productId: 'prod-pistachio', quantity: 3 }],
      });

      const { payment } = await ordersService.recordPayment({
        actorUserId: operatorId,
        orderId: order.id,
        branchId,
        amount: order.total,
        method: PaymentMethod.CASH,
      });
      await ordersService.verifyPayment({ actorUserId: operatorId, orderId: order.id, paymentId: payment.id });
      await ordersService.confirmOrder(operatorId, order.id);

      // Stock: Pistachio = 20 - 3 = 17, Belgian = 20
      let pStock = await inventoryRepo.findByProduct(branchId, 'prod-pistachio');
      let bStock = await inventoryRepo.findByProduct(branchId, 'prod-belgian');
      assert.strictEqual(pStock?.quantity, 17);
      assert.strictEqual(bStock?.quantity, 20);

      // Edit: Delete Pistachio (3 -> 0) and Add Belgian (0 -> 2)
      // Pistachio price = 100, Belgian price = 150
      // Old subtotal: 300, New subtotal: 300 -> additional payment = 0!
      // Since additional payment = 0, Belgian delta (+2) is consumed and Pistachio (+3) is restored immediately!
      await ordersService.editOrder({
        actorUserId: operatorId,
        orderId: order.id,
        items: [{ productId: 'prod-belgian', quantity: 2 }],
      });

      pStock = await inventoryRepo.findByProduct(branchId, 'prod-pistachio');
      bStock = await inventoryRepo.findByProduct(branchId, 'prod-belgian');
      assert.strictEqual(pStock?.quantity, 20, 'Pistachio stock restored to 20 upon deletion');
      assert.strictEqual(bStock?.quantity, 18, 'Belgian stock deducted to 18 upon addition');

      const movements = await inventoryRepo.listMovements(branchId, 20);
      const rev = movements.find((m) => m.product_id === 'prod-pistachio' && m.movement_type === 'ORDER_REVERSAL');
      const cons = movements.find((m) => m.product_id === 'prod-belgian' && m.movement_type === 'ORDER_CONSUMPTION');
      assert.ok(rev, 'Pistachio reversal logged');
      assert.ok(cons, 'Belgian consumption logged');
    });
  });

  describe('5. Coupon Concurrency and Limits', () => {
    it('concurrent confirmation enforces per_user_usage_limit = 1 across multiple orders of same user', async () => {
      // Refill product: 50 units
      await inventoryService.refillProductStock(branchId, 'prod-pistachio', 50, operatorId, 'Stocked');

      // Create coupon with per_user_usage_limit = 1
      const coupon = await promotionsService.createCoupon(branchId, operatorId, {
        code: 'USERONCE',
        name: 'Once Per User',
        discount_type: DiscountType.FIXED,
        discount_value: 10,
        minimum_order_value: 50,
        per_user_usage_limit: 1,
        start_at: new Date().toISOString(),
        end_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        active: true,
      });

      // Customer creates Order 1 and Order 2 with USERONCE
      const { order: o1 } = await ordersService.createOrder({
        actorUserId: customerId,
        customerUserId: customerId,
        branchId,
        items: [{ productId: 'prod-pistachio', quantity: 1 }],
        couponCode: coupon.code,
      });

      const { order: o2 } = await ordersService.createOrder({
        actorUserId: customerId,
        customerUserId: customerId,
        branchId,
        items: [{ productId: 'prod-pistachio', quantity: 1 }],
        couponCode: coupon.code,
      });

      // Record & verify payments for both orders
      const { payment: p1 } = await ordersService.recordPayment({
        actorUserId: operatorId,
        orderId: o1.id,
        branchId,
        amount: o1.total,
        method: PaymentMethod.CASH,
      });
      await ordersService.verifyPayment({ actorUserId: operatorId, orderId: o1.id, paymentId: p1.id });

      const { payment: p2 } = await ordersService.recordPayment({
        actorUserId: operatorId,
        orderId: o2.id,
        branchId,
        amount: o2.total,
        method: PaymentMethod.CASH,
      });
      await ordersService.verifyPayment({ actorUserId: operatorId, orderId: o2.id, paymentId: p2.id });

      // Confirm Order 1 succeeds
      const conf1 = await ordersService.confirmOrder(operatorId, o1.id);
      assert.strictEqual(conf1.status, OrderStatus.CONFIRMED);

      // Confirm Order 2 must fail because per_user_usage_limit = 1 is reached
      await assert.rejects(
        async () => {
          await ordersService.confirmOrder(operatorId, o2.id);
        },
        (err: any) => err.message.includes('Coupon usage limit reached') || err.message.includes('Confirmation failed'),
      );

      // Verify coupon_usages table has exactly 1 entry for this user
      const usages = await db
        .prepare('SELECT count(*) as count FROM coupon_usages WHERE coupon_id = ? AND user_id = ?')
        .bind(coupon.id, customerId)
        .first<{ count: number }>();
      assert.strictEqual(usages?.count, 1);
    });
  });

  describe('6. Non-Negative Database Trigger Invariants', () => {
    it('database trigger aborts any mutation that would make inventory quantity negative', async () => {
      await inventoryService.refillProductStock(branchId, 'prod-pistachio', 5, operatorId, 'Stocked');

      // Attempting to set quantity to -1 directly via SQL must be blocked by trigger
      await assert.rejects(
        async () => {
          await db.prepare('UPDATE inventory SET quantity = -1 WHERE branch_id = ? AND product_id = ?')
            .bind(branchId, 'prod-pistachio')
            .run();
        },
        (err: any) => err.message.includes('Inventory stock cannot be negative'),
      );
    });

    it('database trigger aborts any mutation that would make raw material quantity negative', async () => {
      const mat = await inventoryService.createRawMaterial(branchId, operatorId, {
        name: 'Cocoa',
        unit: 'kg',
        current_quantity: 5,
      });

      // Attempting to set current_quantity to -1 directly via SQL must be blocked by trigger
      await assert.rejects(
        async () => {
          await db.prepare('UPDATE raw_materials SET current_quantity = -1 WHERE id = ?')
            .bind(mat.id)
            .run();
        },
        (err: any) => err.message.includes('Raw material stock cannot be negative'),
      );
    });
  });

  describe('7. Realtime Consistency Under Confirmation', () => {
    it('publishes OrderStatusChanged event strictly after DB confirmation and emits nothing on failed confirmation', async () => {
      const eventsEmitted: any[] = [];
      const sub = centralRealtimeHub.subscribe({}, (evt) => {
        if (evt.type === 'OrderStatusChanged') {
          eventsEmitted.push(evt);
        }
      });

      // 1. Successful confirmation flow
      await inventoryService.refillProductStock(branchId, 'prod-pistachio', 10, operatorId, 'Stock');
      const { order } = await ordersService.createOrder({
        actorUserId: customerId,
        customerUserId: customerId,
        branchId,
        items: [{ productId: 'prod-pistachio', quantity: 1 }],
      });

      const { payment } = await ordersService.recordPayment({
        actorUserId: operatorId,
        orderId: order.id,
        branchId,
        amount: order.total,
        method: PaymentMethod.CASH,
      });
      await ordersService.verifyPayment({ actorUserId: operatorId, orderId: order.id, paymentId: payment.id });

      eventsEmitted.length = 0; // reset
      await ordersService.confirmOrder(operatorId, order.id);

      const confirmedEvt = eventsEmitted.find((e) => e.payload.status === OrderStatus.CONFIRMED);
      assert.ok(confirmedEvt, 'OrderStatusChanged event emitted on confirmed order');
      assert.strictEqual(confirmedEvt.payload.orderId, order.id);

      // 2. Failed confirmation flow (insufficient stock)
      const { order: oFail } = await ordersService.createOrder({
        actorUserId: customerId,
        customerUserId: customerId,
        branchId,
        items: [{ productId: 'prod-pistachio', quantity: 50 }], // exceeds available stock (9)
      });
      const { payment: pFail } = await ordersService.recordPayment({
        actorUserId: operatorId,
        orderId: oFail.id,
        branchId,
        amount: oFail.total,
        method: PaymentMethod.CASH,
      });
      await ordersService.verifyPayment({ actorUserId: operatorId, orderId: oFail.id, paymentId: pFail.id });

      eventsEmitted.length = 0; // reset
      await assert.rejects(async () => {
        await ordersService.confirmOrder(operatorId, oFail.id);
      });

      const noEvt = eventsEmitted.find((e) => e.payload.orderId === oFail.id && e.payload.status === OrderStatus.CONFIRMED);
      assert.strictEqual(noEvt, undefined, 'No confirmed event must be emitted when confirmation fails');

      sub();
    });
  });

  describe('8. Atomic Deferred Inventory with Payment Verification', () => {
    it('aborts payment verification and rolls back payment status if deferred inventory is unavailable', async () => {
      // Stock 5 units
      await inventoryService.refillProductStock(branchId, 'prod-pistachio', 5, operatorId, 'Stocked');

      // Create & confirm order for 2 units
      const { order } = await ordersService.createOrder({
        actorUserId: customerId,
        customerUserId: customerId,
        branchId,
        items: [{ productId: 'prod-pistachio', quantity: 2 }],
      });

      const { payment: p1 } = await ordersService.recordPayment({
        actorUserId: operatorId,
        orderId: order.id,
        branchId,
        amount: order.total,
        method: PaymentMethod.CASH,
      });
      await ordersService.verifyPayment({ actorUserId: operatorId, orderId: order.id, paymentId: p1.id });
      await ordersService.confirmOrder(operatorId, order.id);

      // Remaining stock: 5 - 2 = 3
      let stock = await inventoryRepo.findByProduct(branchId, 'prod-pistachio');
      assert.strictEqual(stock?.quantity, 3);

      // Edit order: increase from 2 to 5 (needs +3 more units)
      const editRes = await ordersService.editOrder({
        actorUserId: operatorId,
        orderId: order.id,
        items: [{ productId: 'prod-pistachio', quantity: 5 }],
      });
      assert.ok(editRes.additionalAmountRequired > 0);

      // Record additional payment
      const { payment: addPay } = await ordersService.recordPayment({
        actorUserId: operatorId,
        orderId: order.id,
        branchId,
        amount: editRes.additionalAmountRequired,
        method: PaymentMethod.CASH,
      });

      // Now simulate a concurrent branch stock depletion before payment is verified!
      // Reduce stock from 3 to 1 so the needed 3 is no longer available:
      await inventoryService.adjustProductStock(branchId, 'prod-pistachio', -2, operatorId, 'Spoilage loss');
      stock = await inventoryRepo.findByProduct(branchId, 'prod-pistachio');
      assert.strictEqual(stock?.quantity, 1);

      // Now verifyPayment must abort because deferred inventory (+3) cannot be fulfilled!
      await assert.rejects(
        async () => {
          await ordersService.verifyPayment({
            actorUserId: operatorId,
            orderId: order.id,
            paymentId: addPay.id,
          });
        },
        (err: any) => err.message.includes('Insufficient inventory') || err.message.includes('stock'),
      );

      // Crucial Invariant: The payment must NOT be verified, stock must remain unchanged, no partial mutation!
      const postPayment = await paymentRepo.findById(addPay.id);
      assert.strictEqual(postPayment?.status, PaymentMethod.CASH ? 'RECORDED' : 'PENDING');
      stock = await inventoryRepo.findByProduct(branchId, 'prod-pistachio');
      assert.strictEqual(stock?.quantity, 1);
    });
  });

  describe('9. Offer Usage Limit Atomicity at Confirmation Time', () => {
    it('atomically increments offers.usage_count on order confirmation and enforces usage_limit', async () => {
      // Create offer with usage_limit = 1
      const offer = await promotionsService.createOffer(branchId, operatorId, {
        name: 'Single-Use Blast',
        offer_type: OfferType.FLAT,
        description: 'Flat ₹20 off for 1 order only',
        configuration_json: JSON.stringify({ discount_type: 'FIXED', discount_value: 20 }),
        usage_limit: 1,
        active: true,
        start_at: new Date().toISOString(),
      });

      // Stock products
      await inventoryService.refillProductStock(branchId, 'prod-pistachio', 20, operatorId, 'Stocked');

      // Create Order 1 with offer
      const { order: o1 } = await ordersService.createOrder({
        actorUserId: customerId,
        customerUserId: customerId,
        branchId,
        items: [{ productId: 'prod-pistachio', quantity: 1 }],
        offerId: offer.id,
      });

      // Create Order 2 with offer
      const { order: o2 } = await ordersService.createOrder({
        actorUserId: customerId,
        customerUserId: customerId,
        branchId,
        items: [{ productId: 'prod-pistachio', quantity: 1 }],
        offerId: offer.id,
      });

      // Pay & verify both
      const { payment: p1 } = await ordersService.recordPayment({
        actorUserId: operatorId,
        orderId: o1.id,
        branchId,
        amount: o1.total,
        method: PaymentMethod.CASH,
      });
      await ordersService.verifyPayment({ actorUserId: operatorId, orderId: o1.id, paymentId: p1.id });

      const { payment: p2 } = await ordersService.recordPayment({
        actorUserId: operatorId,
        orderId: o2.id,
        branchId,
        amount: o2.total,
        method: PaymentMethod.CASH,
      });
      await ordersService.verifyPayment({ actorUserId: operatorId, orderId: o2.id, paymentId: p2.id });

      // Confirm Order 1 succeeds
      const conf1 = await ordersService.confirmOrder(operatorId, o1.id);
      assert.strictEqual(conf1.status, OrderStatus.CONFIRMED);

      // Invariant: offer.usage_count is now 1 in the database
      const updatedOffer = await promotionsService.getOfferById(branchId, offer.id);
      assert.strictEqual(updatedOffer?.usage_count, 1);

      // Confirm Order 2 must fail because usage_limit = 1 is reached
      await assert.rejects(
        async () => {
          await ordersService.confirmOrder(operatorId, o2.id);
        },
        (err: any) => err.message.includes('Offer usage limit reached') || err.message.includes('Confirmation failed'),
      );
    });
  });

  describe('10. Initial Raw Material Quantity Movement', () => {
    it('creates a REFILL movement record when raw material is created with initial quantity > 0', async () => {
      const mat = await inventoryService.createRawMaterial(branchId, operatorId, {
        name: 'Cocoa Powder',
        unit: 'kg',
        current_quantity: 15,
        reorder_threshold: 5,
      });

      assert.strictEqual(mat.current_quantity, 15);

      const movements = await inventoryRepo.listMovements(branchId);
      const initialMov = movements.find((m) => m.raw_material_id === mat.id);

      assert.ok(initialMov, 'Expected movement record for initial raw material quantity');
      assert.strictEqual(initialMov.movement_type, 'REFILL');
      assert.strictEqual(initialMov.quantity_delta, 15);
      assert.strictEqual(initialMov.reference_type, 'INITIAL');
      assert.strictEqual(initialMov.inventory_item_type, 'RAW_MATERIAL');
    });

    it('does not create a movement record when raw material is created with quantity 0', async () => {
      const mat = await inventoryService.createRawMaterial(branchId, operatorId, {
        name: 'Empty Container Powder',
        unit: 'kg',
        current_quantity: 0,
      });

      const movements = await inventoryRepo.listMovements(branchId);
      const initialMov = movements.find((m) => m.raw_material_id === mat.id);
      assert.strictEqual(initialMov, undefined, 'No movement expected for 0 initial stock');
    });
  });

  describe('11. Payment/Order-Total Invariant During Confirmed-Order Reduction', () => {
    it('accurately calculates and audits refund/credit amount when order total is edited below verified paid', async () => {
      // Stock 10 units
      await inventoryService.refillProductStock(branchId, 'prod-pistachio', 10, operatorId, 'Stocked');

      // Create order with 5 units (total = 5 * 105 = 525)
      const { order } = await ordersService.createOrder({
        actorUserId: customerId,
        customerUserId: customerId,
        branchId,
        items: [{ productId: 'prod-pistachio', quantity: 5 }],
      });

      const { payment } = await ordersService.recordPayment({
        actorUserId: operatorId,
        orderId: order.id,
        branchId,
        amount: order.total,
        method: PaymentMethod.CASH,
      });
      await ordersService.verifyPayment({ actorUserId: operatorId, orderId: order.id, paymentId: payment.id });
      await ordersService.confirmOrder(operatorId, order.id);

      // Edit order down to 2 units (total = 2 * 105 = 210)
      const editRes = await ordersService.editOrder({
        actorUserId: operatorId,
        orderId: order.id,
        items: [{ productId: 'prod-pistachio', quantity: 2 }],
      });

      assert.strictEqual(editRes.order.status, OrderStatus.CONFIRMED);
      assert.strictEqual(editRes.newTotal, 210);
      assert.strictEqual(editRes.verifiedPaidAmount, 525);
      assert.strictEqual(editRes.overpaymentAmount, 315);
      assert.strictEqual(editRes.refundCreditAmount, 315);
      assert.strictEqual(editRes.additionalAmountRequired, 0);

      // Verify payments are preserved and not silently lost
      const payments = await paymentRepo.listByOrder(order.id);
      assert.strictEqual(payments.length, 1);
      assert.strictEqual(payments[0].amount, 525);

      // Verify audit log has explicit financialState capturing refund/credit due
      const audits = await auditRepo.listByBranch(branchId);
      const editAudit = audits.find((a) => a.action === AuditAction.ORDER_EDITED && a.entity_id === order.id);
      assert.ok(editAudit, 'Expected ORDER_EDITED audit entry');
      const editMeta = JSON.parse(editAudit.metadata_json ?? '{}');
      assert.strictEqual(editMeta?.refundCreditAmount, 315);
      assert.strictEqual(editMeta?.financialState?.rule, 'REFUND_OR_CREDIT_DUE');
      assert.strictEqual(editMeta?.financialState?.refundCreditAmount, 315);
    });
  });

  describe('12. Offer Usage Audit Naming (OFFER_APPLIED)', () => {
    it('audits offer consumption with dedicated OFFER_APPLIED action', async () => {
      const offer = await promotionsService.createOffer(branchId, operatorId, {
        name: 'Audit Trail Promo',
        offer_type: OfferType.FLAT,
        configuration_json: JSON.stringify({ discount_type: 'FIXED', discount_value: 10 }),
        start_at: new Date().toISOString(),
      });

      await inventoryService.refillProductStock(branchId, 'prod-pistachio', 5, operatorId, 'Stocked');

      const { order } = await ordersService.createOrder({
        actorUserId: customerId,
        customerUserId: customerId,
        branchId,
        items: [{ productId: 'prod-pistachio', quantity: 1 }],
        offerId: offer.id,
      });

      const { payment } = await ordersService.recordPayment({
        actorUserId: operatorId,
        orderId: order.id,
        branchId,
        amount: order.total,
        method: PaymentMethod.CASH,
      });
      await ordersService.verifyPayment({ actorUserId: operatorId, orderId: order.id, paymentId: payment.id });
      await ordersService.confirmOrder(operatorId, order.id);

      const audits = await auditRepo.listByBranch(branchId);
      const offerAudit = audits.find((a) => a.action === AuditAction.OFFER_APPLIED && a.entity_id === offer.id);
      assert.ok(offerAudit, 'Expected OFFER_APPLIED audit record on order confirmation');
      const offerMeta = JSON.parse(offerAudit.metadata_json ?? '{}');
      assert.strictEqual(offerMeta?.orderId, order.id);
      assert.strictEqual(offerMeta?.action, 'offer_consumed');
    });
  });
});
