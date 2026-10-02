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
import { DatabaseRealtimeService } from '../../backend/services/realtime/database-realtime.service';
import { OrderStatus, PaymentStatus, PaymentMethod } from '../../shared/enums/order.enum';
import { BranchStatus } from '../../shared/enums/branch.enum';
import { UserRole, MembershipStatus } from '../../shared/enums/roles.enum';
import { D1DatabaseLike } from '../../database/types';
import { handleRealtimeTicketRoute, handleRealtimeEventsRoute } from '../../api/routes/realtime.route';

describe('Phase 3 — Concurrency, Payment Lifecycle & Ticket Transport Tests', () => {
  let db: D1DatabaseLike;
  let orderRepo: OrderRepository;
  let paymentRepo: PaymentRepository;
  let auditRepo: AuditRepository;
  let ordersService: OrdersService;
  let expiryJob: OrderExpiryJob;
  let realtimeService: DatabaseRealtimeService;

  beforeEach(async () => {
    db = createMemoryD1Database();
    await runMigrations(db);

    orderRepo = new OrderRepository(db);
    paymentRepo = new PaymentRepository(db);
    auditRepo = new AuditRepository(db);
    const branchRepo = new BranchRepository(db);
    const productRepo = new ProductRepository(db);
    const userRepo = new UserRepository(db);
    realtimeService = new DatabaseRealtimeService(db);

    ordersService = new OrdersService(
      orderRepo,
      paymentRepo,
      productRepo,
      auditRepo,
      branchRepo,
      realtimeService,
    );

    expiryJob = new OrderExpiryJob(orderRepo, realtimeService, auditRepo);

    // Seed branch & products first
    await branchRepo.create({ id: 'branch-alpha', name: 'Branch Alpha', code: 'ALPHA', status: BranchStatus.ACTIVE });
    await productRepo.createCategory({ id: 'cat-scoops', branch_id: 'branch-alpha', name: 'Scoops', active: true, sort_order: 1 });
    await productRepo.create({ id: 'prod-1', branch_id: 'branch-alpha', category_id: 'cat-scoops', name: 'Vanilla', price: 100, active: true });
    await productRepo.create({ id: 'prod-2', branch_id: 'branch-alpha', category_id: 'cat-scoops', name: 'Belgian Chocolate', price: 150, active: true });

    // Seed test users & membership
    await userRepo.create({ id: 'usr-cust', firebase_uid: 'fb-cust', email: 'cust@melt.local', display_name: 'Customer', role: UserRole.CUSTOMER });
    await userRepo.create({ id: 'usr-op', firebase_uid: 'fb-op', email: 'op@melt.local', display_name: 'Operator', role: UserRole.CUSTOMER });
    await userRepo.addMembership('mem-op', 'usr-op', 'branch-alpha', UserRole.BRANCH_OPERATOR, MembershipStatus.ACTIVE);
  });

  describe('Real Concurrent Execution Tests', () => {
    it('concurrent confirm vs confirm: only one confirmation succeeds or both resolve safely without duplicates', async () => {
      // 1. Create order
      const { order } = await ordersService.createOrder({
        actorUserId: 'usr-cust',
        customerUserId: 'usr-cust',
        branchId: 'branch-alpha',
        items: [{ productId: 'prod-1', quantity: 1 }],
      });

      // 2. Record & verify payment
      const { payment } = await ordersService.recordPayment({
        actorUserId: 'usr-op',
        orderId: order.id,
        branchId: 'branch-alpha',
        amount: 105, // 100 + 5% tax
        method: PaymentMethod.CASH,
      });

      await ordersService.verifyPayment({
        actorUserId: 'usr-op',
        orderId: order.id,
        paymentId: payment.id,
      });

      // 3. Trigger concurrent confirmations simultaneously
      const results = await Promise.allSettled([
        ordersService.confirmOrder('usr-op', order.id),
        ordersService.confirmOrder('usr-op', order.id),
      ]);

      // Both should settle cleanly without corruption
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      assert.ok(fulfilled.length >= 1, 'At least one confirmation must succeed');

      const confirmed = await orderRepo.findById(order.id);
      assert.strictEqual(confirmed?.status, OrderStatus.CONFIRMED);

      // Verify audit logs do not contain duplicated confirmed events
      const audits = await auditRepo.listByEntity('order', order.id);
      const confirmAudits = audits.filter((a) => a.action === 'ORDER_CONFIRMED');
      assert.strictEqual(confirmAudits.length, 1, 'Exactly one ORDER_CONFIRMED audit event must be recorded');
    });

    it('concurrent verify vs verify: idempotent payment verification under concurrent requests', async () => {
      const { order } = await ordersService.createOrder({
        actorUserId: 'usr-cust',
        customerUserId: 'usr-cust',
        branchId: 'branch-alpha',
        items: [{ productId: 'prod-1', quantity: 1 }],
      });

      const { payment } = await ordersService.recordPayment({
        actorUserId: 'usr-op',
        orderId: order.id,
        branchId: 'branch-alpha',
        amount: 105,
        method: PaymentMethod.CARD,
      });

      // Competing verification calls
      const results = await Promise.allSettled([
        ordersService.verifyPayment({ actorUserId: 'usr-op', orderId: order.id, paymentId: payment.id }),
        ordersService.verifyPayment({ actorUserId: 'usr-op', orderId: order.id, paymentId: payment.id }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      if (rejected.length > 0) {
        // Idempotent duplicate verification can either fulfill or safely report duplicate
        assert.ok(fulfilled.length >= 1, 'At least one verification must succeed');
      } else {
        assert.strictEqual(fulfilled.length, 2, 'Both verification calls fulfilled safely');
      }

      const updatedPayment = await paymentRepo.findById(payment.id);
      assert.strictEqual(updatedPayment?.status, PaymentStatus.VERIFIED);
    });

    it('concurrent expire vs confirm: order either confirms or expires, never both', async () => {
      // 1. Create order with fresh expiry
      const order = await orderRepo.create({
        id: 'ord-race-expire',
        order_number: 'ALPHA-RACE-001',
        branch_id: 'branch-alpha',
        customer_user_id: 'usr-cust',
        subtotal: 100,
        total: 105,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        items: [{
          id: 'item-race',
          product_id: 'prod-1',
          product_name_snapshot: 'Vanilla',
          unit_price_snapshot: 100,
          quantity: 1,
          line_total: 100,
        }],
      });

      // 2. Record & verify payment while order is valid
      const { payment } = await ordersService.recordPayment({
        actorUserId: 'usr-op',
        orderId: order.id,
        branchId: 'branch-alpha',
        amount: 105,
        method: PaymentMethod.UPI,
      });
      await ordersService.verifyPayment({
        actorUserId: 'usr-op',
        orderId: order.id,
        paymentId: payment.id,
      });

      // 3. Mark expiry in the past to trigger race condition
      const pastTime = new Date(Date.now() - 60_000).toISOString();
      await db.prepare('UPDATE orders SET expires_at = ? WHERE id = ?').bind(pastTime, order.id).run();

      // 4. Competing jobs: expiry job vs operator confirm
      await Promise.allSettled([
        expiryJob.processExpiredOrders(),
        ordersService.confirmOrder('usr-op', order.id),
      ]);

      const finalOrder = await orderRepo.findById(order.id);
      assert.ok(
        finalOrder?.status === OrderStatus.CONFIRMED || finalOrder?.status === OrderStatus.EXPIRED,
        'Order must resolve to either CONFIRMED or EXPIRED',
      );
    });

    it('concurrent edit vs expire: cannot edit an expired order', async () => {
      const pastTime = new Date(Date.now() - 60_000).toISOString();
      const order = await orderRepo.create({
        id: 'ord-race-edit',
        order_number: 'ALPHA-RACE-002',
        branch_id: 'branch-alpha',
        customer_user_id: 'usr-cust',
        subtotal: 100,
        total: 105,
        expires_at: pastTime,
        items: [{
          id: 'item-race-2',
          product_id: 'prod-1',
          product_name_snapshot: 'Vanilla',
          unit_price_snapshot: 100,
          quantity: 1,
          line_total: 100,
        }],
      });

      // Run expiry job first
      await expiryJob.processExpiredOrders();

      // Edit attempt must fail
      await assert.rejects(
        () => ordersService.editOrder({
          actorUserId: 'usr-op',
          orderId: order.id,
          items: [{ productId: 'prod-2', quantity: 2 }],
        }),
        (err: Error) => err.message.includes('terminal status') || err.message.includes('expired'),
      );
    });
  });

  describe('Order Edit Payment Lifecycle (Sections 7, 8, 9)', () => {
    it('editing confirmed order where newTotal > verifiedPaid preserves CONFIRMED status and requires additional payment', async () => {
      // 1. Create order for 1x Vanilla (total = 105)
      const { order } = await ordersService.createOrder({
        actorUserId: 'usr-cust',
        customerUserId: 'usr-cust',
        branchId: 'branch-alpha',
        items: [{ productId: 'prod-1', quantity: 1 }],
      });

      // 2. Record & verify payment of ₹105
      const { payment } = await ordersService.recordPayment({
        actorUserId: 'usr-op',
        orderId: order.id,
        branchId: 'branch-alpha',
        amount: 105,
        method: PaymentMethod.CASH,
      });
      await ordersService.verifyPayment({
        actorUserId: 'usr-op',
        orderId: order.id,
        paymentId: payment.id,
      });

      // 3. Confirm order
      await ordersService.confirmOrder('usr-op', order.id);

      // 4. Operator edits order to add 1x Belgian Chocolate (new total = 262.50)
      const editRes = await ordersService.editOrder({
        actorUserId: 'usr-op',
        orderId: order.id,
        items: [
          { productId: 'prod-1', quantity: 1 },
          { productId: 'prod-2', quantity: 1 },
        ],
      });

      // Order must remain operationally CONFIRMED
      assert.strictEqual(editRes.order.status, OrderStatus.CONFIRMED);
      assert.strictEqual(editRes.newTotal, 262.5);
      assert.strictEqual(editRes.verifiedPaidAmount, 105);
      assert.strictEqual(editRes.additionalAmountRequired, 157.5);

      // Order payment status reflects pending additional balance
      assert.strictEqual(editRes.order.payment_status, PaymentStatus.PENDING);

      // 5. Operator records second payment for the exact outstanding amount (₹157.50)
      const secondPay = await ordersService.recordPayment({
        actorUserId: 'usr-op',
        orderId: order.id,
        branchId: 'branch-alpha',
        amount: 157.5,
        method: PaymentMethod.UPI,
      });

      // 6. Verify second payment -> order closes balance and returns to fully VERIFIED
      const verifiedSecond = await ordersService.verifyPayment({
        actorUserId: 'usr-op',
        orderId: order.id,
        paymentId: secondPay.payment.id,
      });

      assert.strictEqual(verifiedSecond.order.payment_status, PaymentStatus.VERIFIED);
      assert.strictEqual(verifiedSecond.order.status, OrderStatus.CONFIRMED);
    });

    it('editing confirmed order where newTotal < verifiedPaid records overpayment without deleting payments or issuing silent refunds', async () => {
      // 1. Create order for 2x Belgian Chocolate (total = 315)
      const { order } = await ordersService.createOrder({
        actorUserId: 'usr-cust',
        customerUserId: 'usr-cust',
        branchId: 'branch-alpha',
        items: [{ productId: 'prod-2', quantity: 2 }],
      });

      // 2. Pay ₹315, verify, and confirm
      const { payment } = await ordersService.recordPayment({
        actorUserId: 'usr-op',
        orderId: order.id,
        branchId: 'branch-alpha',
        amount: 315,
        method: PaymentMethod.CARD,
      });
      await ordersService.verifyPayment({
        actorUserId: 'usr-op',
        orderId: order.id,
        paymentId: payment.id,
      });
      await ordersService.confirmOrder('usr-op', order.id);

      // 3. Operator edits order down to 1x Vanilla (total = 105)
      const editRes = await ordersService.editOrder({
        actorUserId: 'usr-op',
        orderId: order.id,
        items: [{ productId: 'prod-1', quantity: 1 }],
      });

      assert.strictEqual(editRes.order.status, OrderStatus.CONFIRMED);
      assert.strictEqual(editRes.newTotal, 105);
      assert.strictEqual(editRes.verifiedPaidAmount, 315);
      assert.strictEqual(editRes.overpaymentAmount, 210);
      assert.strictEqual(editRes.order.payment_status, PaymentStatus.VERIFIED);

      // Verify payment records still exist and were not deleted
      const allPayments = await paymentRepo.listByOrder(order.id);
      assert.strictEqual(allPayments.length, 1);
      assert.strictEqual(allPayments[0].amount, 315);
    });
  });

  describe('Realtime Ephemeral Ticket Transport (Section 6)', () => {
    it('issues single-use ticket via POST /realtime/ticket and authorizes SSE connection without query token', async () => {
      // 1. Request ticket using Authorization header (token never in URL query string)
      const ticketReq = new Request('https://melt.local/api/v1/realtime/ticket', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock-user:usr-cust:cust@melt.local:Customer',
        },
      });

      const ticketRes = await handleRealtimeTicketRoute(ticketReq, { DB: db });
      assert.strictEqual(ticketRes.status, 201);
      const ticketBody = (await ticketRes.json()) as { success: boolean; data: { ticket: string } };
      assert.ok(ticketBody.data?.ticket.startsWith('rt_'));

      // 2. Establish SSE connection using single-use ticket
      const sseReq = new Request(`https://melt.local/api/v1/realtime/events?ticket=${ticketBody.data.ticket}`);
      const sseRes = await handleRealtimeEventsRoute(sseReq, { DB: db });
      assert.strictEqual(sseRes.status, 200);
      assert.strictEqual(sseRes.headers.get('content-type'), 'text/event-stream');

      // 3. Second attempt with the same ticket must be rejected (single-use guarantee)
      const secondReq = new Request(`https://melt.local/api/v1/realtime/events?ticket=${ticketBody.data.ticket}`);
      const secondRes = await handleRealtimeEventsRoute(secondReq, { DB: db });
      assert.strictEqual(secondRes.status, 401);
    });
  });

  describe('Production Database Realtime Adapter (Section 3 & 4)', () => {
    it('persists events to realtime_events table and supports catch-up retrieval via getRecentEvents', async () => {
      const now = new Date().toISOString();
      await realtimeService.publish({
        type: 'OrderStatusChanged',
        payload: {
          orderId: 'ord-catchup-1',
          orderNumber: 'ALPHA-20261002-0001',
          branchId: 'branch-alpha',
          customerUserId: 'usr-cust',
          status: OrderStatus.PENDING,
          paymentStatus: PaymentStatus.PENDING,
          total: 105,
          timestamp: now,
        },
      });

      const recent = await realtimeService.getRecentEvents({ orderId: 'ord-catchup-1' });
      assert.strictEqual(recent.length, 1);
      assert.strictEqual(recent[0].type, 'OrderStatusChanged');
      assert.strictEqual(recent[0].payload.orderId, 'ord-catchup-1');
    });
  });
});
