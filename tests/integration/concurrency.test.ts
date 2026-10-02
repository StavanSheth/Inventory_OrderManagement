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
import { DatabaseRealtimeService, centralRealtimeHub } from '../../backend/services/realtime/database-realtime.service';
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
    centralRealtimeHub.clear();
    db = createMemoryD1Database();
    await runMigrations(db);
    centralRealtimeHub.setDatabase(db);

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

    it('cross-request delivery: subscriber connection A receives events published by request context B via shared D1', async () => {
      // Instance A represents subscriber connection context (e.g. active SSE stream)
      const serviceA = new DatabaseRealtimeService(db);
      // Instance B represents a completely separate request context (e.g. confirm/payment route)
      const serviceB = new DatabaseRealtimeService(db);

      const receivedEvents: unknown[] = [];
      const unsubscribe = serviceA.subscribe({ orderId: 'ord-cross-1' }, (event) => {
        receivedEvents.push(event);
      });

      // Request B publishes event through serviceB
      const now = new Date().toISOString();
      await serviceB.publish({
        type: 'OrderStatusChanged',
        payload: {
          orderId: 'ord-cross-1',
          orderNumber: 'ALPHA-20261002-0002',
          branchId: 'branch-alpha',
          customerUserId: 'usr-cust',
          status: OrderStatus.CONFIRMED,
          paymentStatus: PaymentStatus.VERIFIED,
          total: 105,
          timestamp: now,
        },
      });

      // Service A instantly received the event through CentralRealtimeHub without polling!
      assert.strictEqual(receivedEvents.length, 1);
      assert.strictEqual((receivedEvents[0] as { type: string }).type, 'OrderStatusChanged');

      // Now verify that an external D1 event (written directly by another isolate) is caught up on poll
      const extEventId = `evt-ext-${crypto.randomUUID()}`;
      await db.prepare(`
        INSERT INTO realtime_events (id, event_type, payload_json, branch_id, order_id, customer_user_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        extEventId,
        'OrderStatusChanged',
        JSON.stringify({ orderId: 'ord-cross-1', status: 'READY', total: 105 }),
        'branch-alpha',
        'ord-cross-1',
        'usr-cust',
        new Date().toISOString(),
      ).run();

      const dispatched = await serviceA.pollOnce();
      assert.strictEqual(dispatched, 1, 'Service A must dispatch the external D1 event on poll');
      assert.strictEqual(receivedEvents.length, 2);

      unsubscribe();
      serviceA.clear();
      serviceB.clear();
    });

    it('prevents confirmation bypass: generic updateOrderStatus rejects transition to CONFIRMED', async () => {
      const { order } = await ordersService.createOrder({
        actorUserId: 'usr-cust',
        customerUserId: 'usr-cust',
        branchId: 'branch-alpha',
        items: [{ productId: 'prod-1', quantity: 1 }],
      });

      await assert.rejects(
        async () => {
          await ordersService.updateOrderStatus('usr-op', order.id, OrderStatus.CONFIRMED);
        },
        /Order confirmation requires verified payment and must be performed via the confirmation endpoint/,
      );
    });

    it('atomic order edit rollback: atomicEditOrder rolls back all mutations if constraint fails', async () => {
      const { order } = await ordersService.createOrder({
        actorUserId: 'usr-cust',
        customerUserId: 'usr-cust',
        branchId: 'branch-alpha',
        items: [{ productId: 'prod-1', quantity: 1 }],
      });

      // Attempt atomic edit with impossible cutoff (simulating edit window expired)
      const pastCutoff = new Date(Date.now() + 1000000).toISOString(); // cutoff is in the future
      await assert.rejects(
        async () => {
          await orderRepo.atomicEditOrder({
            orderId: order.id,
            items: [{
              id: 'item-fake',
              product_id: 'prod-2',
              product_name_snapshot: 'Belgian Chocolate',
              unit_price_snapshot: 150,
              quantity: 2,
              line_total: 300,
            }],
            subtotal: 300,
            tax: 15,
            total: 315,
            lastEditedAt: new Date().toISOString(),
            editCutoffIso: pastCutoff,
            auditLog: {
              id: 'aud-fake-rollback',
              branchId: 'branch-alpha',
              actorUserId: 'usr-op',
              action: 'ORDER_EDITED',
              metadata: {},
            },
          });
        },
        /cannot be edited/,
      );

      // Verify original order items remain intact (not deleted)
      const items = await orderRepo.getOrderItems(order.id);
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].product_id, 'prod-1');

      // Verify no audit record was inserted
      const audits = await auditRepo.listByEntity('order', order.id);
      const editAudit = audits.find((a) => a.action === 'ORDER_EDITED');
      assert.strictEqual(editAudit, undefined);
    });

    it('concurrent payment recording race: prevents double-recording and overpayment at DB level', async () => {
      const { order } = await ordersService.createOrder({
        actorUserId: 'usr-cust',
        customerUserId: 'usr-cust',
        branchId: 'branch-alpha',
        items: [{ productId: 'prod-1', quantity: 1 }],
      });

      // Two concurrent requests attempt to record remaining payment of ₹105
      const results = await Promise.allSettled([
        ordersService.recordPayment({
          actorUserId: 'usr-op',
          orderId: order.id,
          branchId: 'branch-alpha',
          amount: 105,
          method: PaymentMethod.CASH,
        }),
        ordersService.recordPayment({
          actorUserId: 'usr-op',
          orderId: order.id,
          branchId: 'branch-alpha',
          amount: 105,
          method: PaymentMethod.CASH,
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      assert.strictEqual(fulfilled.length, 1, 'Exactly one payment record request must succeed');
      assert.strictEqual(rejected.length, 1, 'The racing payment record request must be rejected');

      // Verify payments in database
      const payments = await paymentRepo.listByOrder(order.id);
      assert.strictEqual(payments.length, 1, 'Strictly 1 payment record exists in the database');
      assert.strictEqual(payments[0].status, PaymentStatus.RECORDED);
      assert.strictEqual(payments[0].amount, 105);

      // Verify audit logs have exactly 1 PAYMENT_RECORDED event
      const paymentAudits = await auditRepo.listByEntity('payment', payments[0].id);
      assert.strictEqual(paymentAudits.length, 1);
      assert.strictEqual(paymentAudits[0].action, 'PAYMENT_RECORDED');
    });

    it('order sequence concurrency: 100 concurrent creations generate 100 collision-free order numbers', async () => {
      const promises = Array.from({ length: 100 }, () =>
        orderRepo.generateNextOrderNumber('branch-alpha', 'ALPHA'),
      );

      const numbers = await Promise.all(promises);
      const uniqueNumbers = new Set(numbers);

      assert.strictEqual(numbers.length, 100);
      assert.strictEqual(uniqueNumbers.size, 100, 'All 100 generated order numbers must be strictly unique');
    });

    it('order expiry semantics: records actor_type SYSTEM, nullable actor_user_id, and sets expired_at', async () => {
      const pastTime = new Date(Date.now() - 120_000).toISOString();
      const order = await orderRepo.create({
        id: 'ord-expiry-test',
        order_number: 'ALPHA-EXPIRE-999',
        branch_id: 'branch-alpha',
        customer_user_id: 'usr-cust',
        subtotal: 100,
        total: 105,
        expires_at: pastTime,
        items: [{
          id: 'item-exp-1',
          product_id: 'prod-1',
          product_name_snapshot: 'Vanilla',
          unit_price_snapshot: 100,
          quantity: 1,
          line_total: 100,
        }],
      });

      const { expiredCount } = await expiryJob.processExpiredOrders();
      assert.ok(expiredCount >= 1, 'Should expire the overdue order');

      const expiredOrder = await orderRepo.findById(order.id);
      assert.strictEqual(expiredOrder?.status, OrderStatus.EXPIRED);
      assert.ok(expiredOrder?.expired_at, 'expired_at must be populated');
      assert.strictEqual(expiredOrder?.cancelled_at, null, 'cancelled_at must NOT be set for expired orders');

      // Check audit log
      const audits = await auditRepo.listByEntity('order', order.id);
      const expiryAudit = audits.find((a) => a.action === 'ORDER_EXPIRED');
      assert.ok(expiryAudit, 'ORDER_EXPIRED audit log must exist');
      assert.strictEqual(expiryAudit.actor_type, 'SYSTEM');
      assert.strictEqual(expiryAudit.actor_user_id, null);

      // Repeat execution must be idempotent and not create duplicate audit
      const rerun = await expiryJob.processExpiredOrders();
      assert.strictEqual(rerun.expiredCount, 0, 'Re-run should find 0 orders to expire');

      const auditsAfter = await auditRepo.listByEntity('order', order.id);
      const expiryAuditsAfter = auditsAfter.filter((a) => a.action === 'ORDER_EXPIRED');
      assert.strictEqual(expiryAuditsAfter.length, 1, 'Audit log must remain idempotent with exactly 1 entry');
    });

    it('realtime ticket lifecycle: single-use durable ticket cannot be reused', async () => {
      // 1. Issue ticket using mock customer request
      const issueReq = new Request('http://localhost:3000/api/v1/realtime/ticket', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock-user:usr-cust:cust@melt.local:Customer',
        },
      });

      const issueRes = await handleRealtimeTicketRoute(issueReq, { DB: db });
      assert.strictEqual(issueRes.status, 201);
      const { data: { ticket } } = (await issueRes.json()) as { data: { ticket: string } };
      assert.ok(ticket.startsWith('rt_'));

      // 2. First consumption: connects successfully
      const consumeReq = new Request(`https://melt.local/api/v1/realtime/events?ticket=${ticket}`);
      const consumeRes = await handleRealtimeEventsRoute(consumeReq, { DB: db });
      assert.strictEqual(consumeRes.status, 200);

      // Cancel stream
      await consumeRes.body?.cancel();

      // 3. Second consumption: ticket must be single-use and rejected with 401
      const replayReq = new Request(`https://melt.local/api/v1/realtime/events?ticket=${ticket}`);
      const replayRes = await handleRealtimeEventsRoute(replayReq, { DB: db });
      assert.strictEqual(replayRes.status, 401);
    });
  });

  describe('Phase 3 Explicit Concurrency Tests (Tests A-F)', () => {
    it('Test A: edit vs expiry — edit fails cleanly, items remain unchanged, order remains EXPIRED', async () => {
      const { order } = await ordersService.createOrder({
        actorUserId: 'usr-cust',
        customerUserId: 'usr-cust',
        branchId: 'branch-alpha',
        items: [{ productId: 'prod-1', quantity: 2 }],
      });

      // Expire order
      await db
        .prepare("UPDATE orders SET status = 'EXPIRED', expires_at = ? WHERE id = ?")
        .bind(new Date(Date.now() - 60_000).toISOString(), order.id)
        .run();

      // Attempt edit
      await assert.rejects(
        async () => {
          await ordersService.editOrder({
            actorUserId: 'usr-op',
            orderId: order.id,
            items: [{ productId: 'prod-2', quantity: 4 }],
          });
        },
        /expired|terminal status/i,
      );

      // Verify items unchanged
      const items = await orderRepo.getOrderItems(order.id);
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].product_id, 'prod-1');
      assert.strictEqual(items[0].quantity, 2);

      const dbOrder = await orderRepo.findById(order.id);
      assert.strictEqual(dbOrder?.status, OrderStatus.EXPIRED);
    });

    it('Test B: expiry vs payment verification race — never allows EXPIRED + VERIFIED payment', async () => {
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

      // Race expiry and payment verification
      await db
        .prepare("UPDATE orders SET status = 'EXPIRED', expires_at = ? WHERE id = ?")
        .bind(new Date(Date.now() - 1000).toISOString(), order.id)
        .run();

      await assert.rejects(
        async () => {
          await ordersService.verifyPayment({
            actorUserId: 'usr-op',
            orderId: order.id,
            paymentId: payment.id,
          });
        },
        /expired/i,
      );

      const currentOrder = await orderRepo.findById(order.id);
      const currentPayment = await paymentRepo.findById(payment.id);

      assert.strictEqual(currentOrder?.status, OrderStatus.EXPIRED);
      assert.strictEqual(currentPayment?.status, PaymentStatus.RECORDED, 'Payment must remain RECORDED if order expired');
      assert.notStrictEqual(currentPayment?.status, PaymentStatus.VERIFIED, 'Payment must NEVER be VERIFIED on an EXPIRED order');
    });

    it('Test C: concurrent edit — only one valid mutation wins, other fails cleanly, database remains consistent', async () => {
      const { order } = await ordersService.createOrder({
        actorUserId: 'usr-cust',
        customerUserId: 'usr-cust',
        branchId: 'branch-alpha',
        items: [{ productId: 'prod-1', quantity: 1 }],
      });

      // Run two competing edits concurrently
      const results = await Promise.allSettled([
        ordersService.editOrder({
          actorUserId: 'usr-op',
          orderId: order.id,
          items: [{ productId: 'prod-1', quantity: 3 }],
        }),
        ordersService.editOrder({
          actorUserId: 'usr-op',
          orderId: order.id,
          items: [{ productId: 'prod-2', quantity: 2 }],
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      assert.ok(fulfilled.length >= 1, 'At least one edit must settle successfully');

      // Database items must be completely consistent (either 3 prod-1 or 2 prod-2, never mixed or duplicated)
      const items = await orderRepo.getOrderItems(order.id);
      assert.strictEqual(items.length, 1, 'Database must have exactly 1 item record');
      assert.ok(
        (items[0].product_id === 'prod-1' && items[0].quantity === 3) ||
        (items[0].product_id === 'prod-2' && items[0].quantity === 2),
        'Items must match one of the valid edit payloads',
      );
    });

    it('Test D: edit after cancellation — rejected and items unchanged', async () => {
      const { order } = await ordersService.createOrder({
        actorUserId: 'usr-cust',
        customerUserId: 'usr-cust',
        branchId: 'branch-alpha',
        items: [{ productId: 'prod-1', quantity: 1 }],
      });

      await ordersService.updateOrderStatus('usr-op', order.id, OrderStatus.CANCELLED);

      await assert.rejects(
        async () => {
          await ordersService.editOrder({
            actorUserId: 'usr-op',
            orderId: order.id,
            items: [{ productId: 'prod-2', quantity: 5 }],
          });
        },
        /terminal status|cancelled/i,
      );

      const items = await orderRepo.getOrderItems(order.id);
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].product_id, 'prod-1');
      assert.strictEqual(items[0].quantity, 1);
    });

    it('Test E: edit after edit window — rejected and items unchanged', async () => {
      const { order } = await ordersService.createOrder({
        actorUserId: 'usr-cust',
        customerUserId: 'usr-cust',
        branchId: 'branch-alpha',
        items: [{ productId: 'prod-1', quantity: 1 }],
      });

      // Move placed_at to 2 hours ago (exceeding default 60-min edit window)
      const twoHoursAgo = new Date(Date.now() - 120 * 60 * 1000).toISOString();
      await db
        .prepare('UPDATE orders SET placed_at = ?, created_at = ? WHERE id = ?')
        .bind(twoHoursAgo, twoHoursAgo, order.id)
        .run();

      await assert.rejects(
        async () => {
          await ordersService.editOrder({
            actorUserId: 'usr-op',
            orderId: order.id,
            items: [{ productId: 'prod-2', quantity: 2 }],
          });
        },
        /edit window has expired|cannot be edited/i,
      );

      const items = await orderRepo.getOrderItems(order.id);
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].product_id, 'prod-1');
    });

    it('Test F: payment verification after expiry — explicitly rejected, payment stays RECORDED, order stays EXPIRED', async () => {
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
        method: PaymentMethod.CASH,
      });

      // Force order to expire
      const expiredIso = new Date(Date.now() - 30_000).toISOString();
      await db
        .prepare("UPDATE orders SET status = 'EXPIRED', expires_at = ?, expired_at = ? WHERE id = ?")
        .bind(expiredIso, expiredIso, order.id)
        .run();

      await assert.rejects(
        async () => {
          await ordersService.verifyPayment({
            actorUserId: 'usr-op',
            orderId: order.id,
            paymentId: payment.id,
          });
        },
        /expired/i,
      );

      const finalPayment = await paymentRepo.findById(payment.id);
      assert.strictEqual(finalPayment?.status, PaymentStatus.RECORDED);

      const finalOrder = await orderRepo.findById(order.id);
      assert.strictEqual(finalOrder?.status, OrderStatus.EXPIRED);
      assert.notStrictEqual(finalPayment?.status, PaymentStatus.VERIFIED);
    });
  });
});

