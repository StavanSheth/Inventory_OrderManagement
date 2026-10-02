(process.env as Record<string, string | undefined>).NODE_ENV = 'test';

/**
 * Phase 3 — Order API HTTP Integration Tests
 *
 * Uses the TestFirebaseVerifier token format: "mock-user:<uid>:<email>:<displayName>"
 * Sessions are obtained via handleSetPin + handleVerifyPin, exactly matching auth-endpoints.test.ts.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createMemoryD1Database } from '../../database/adapter.sqlite';
import { runMigrations } from '../../database/migrations/runner';
import { UserRepository } from '../../database/repositories/user.repository';
import { BranchRepository } from '../../database/repositories/branch.repository';
import { UserRole, MembershipStatus } from '../../shared/enums/roles.enum';
import { PaymentMethod, OrderStatus, PaymentStatus } from '../../shared/enums/order.enum';
import { handleSetPin, handleVerifyPin } from '../../api/routes/auth.route';
import { resetRateLimits } from '../../api/middleware/rate-limiter';
import {
  handleBranchOrdersRoute,
  handleBranchOrderStatusRoute,
  handleBranchOrderConfirmRoute,
  handleBranchOrderEditRoute,
  handleRecordPaymentRoute,
  handleVerifyPaymentRoute,
} from '../../api/routes/branch-orders.route';
import {
  handleCustomerOrdersRoute,
  handleCreateOrderRoute,
  handleEditOrderRoute,
} from '../../api/routes/customer-orders.route';
import { handleBranchCatalogRoute } from '../../api/routes/catalog.route';
import { D1DatabaseLike } from '../../database/types';

function bearerToken(uid: string, email: string, name: string): string {
  return `Bearer mock-user:${uid}:${email}:${name}`;
}

describe('Phase 3 — Order API HTTP Endpoints', () => {
  let db: D1DatabaseLike;
  let userRepo: UserRepository;
  let branchRepo: BranchRepository;
  let operatorSessionToken: string;
  let ownerSessionToken: string;

  beforeEach(async () => {
    resetRateLimits();
    db = createMemoryD1Database();
    const migrationsDir = path.resolve(process.cwd(), 'database', 'migrations');
    await runMigrations(db, migrationsDir);

    userRepo = new UserRepository(db);
    branchRepo = new BranchRepository(db);

    const now = new Date().toISOString();

    // Branches
    await branchRepo.create({ id: 'branch-alpha', name: 'Alpha Branch', code: 'ALPHA' });
    await branchRepo.create({ id: 'branch-beta', name: 'Beta Branch', code: 'BETA' });

    await db
      .prepare(
        `INSERT INTO branch_settings (id, branch_id, session_timeout_value, session_timeout_unit, order_expiry_minutes, order_edit_window_minutes, updated_at)
         VALUES ('bs-alpha', 'branch-alpha', 4, 'HOURS', 15, 60, ?),
                ('bs-beta',  'branch-beta',  4, 'HOURS', 15, 60, ?)`,
      )
      .bind(now, now)
      .run();

    // Categories + products
    await db
      .prepare(`INSERT INTO categories (id, branch_id, name, active, sort_order, created_at, updated_at) VALUES ('cat-a', 'branch-alpha', 'Scoops', 1, 1, ?, ?)`)
      .bind(now, now)
      .run();
    await db
      .prepare(
        `INSERT INTO products (id, branch_id, category_id, name, description, price, active, created_at, updated_at)
         VALUES ('prod-a1', 'branch-alpha', 'cat-a', 'Pistachio', 'Rich', 100, 1, ?, ?),
                ('prod-a2', 'branch-alpha', 'cat-a', 'Chocolate', 'Dark', 120, 1, ?, ?)`,
      )
      .bind(now, now, now, now)
      .run();

    // Operator
    await userRepo.create({ id: 'usr-op', firebase_uid: 'fb-op', email: 'op@melt.local', display_name: 'Operator', role: UserRole.CUSTOMER });
    await userRepo.addMembership('mem-op', 'usr-op', 'branch-alpha', UserRole.BRANCH_OPERATOR, MembershipStatus.ACTIVE);

    // Owner
    await userRepo.create({ id: 'usr-owner', firebase_uid: 'fb-owner', email: 'owner@melt.local', display_name: 'Owner', role: UserRole.OWNER });

    // Customer + profile
    await userRepo.create({ id: 'usr-cust', firebase_uid: 'fb-cust', email: 'cust@melt.local', display_name: 'Customer', role: UserRole.CUSTOMER });
    await db
      .prepare(`INSERT INTO customer_profiles (id, user_id, preferred_branch_id, marketing_opt_in, created_at, updated_at) VALUES ('prof-c', 'usr-cust', 'branch-alpha', 0, ?, ?)`)
      .bind(now, now)
      .run();

    // Set PINs via API (same pattern as auth-endpoints.test.ts)
    await handleSetPin(
      new Request('http://localhost/', { method: 'POST', headers: { Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'), 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '1234' }) }),
      { DB: db },
    );
    const opVerify = await handleVerifyPin(
      new Request('http://localhost/', { method: 'POST', headers: { Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'), 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '1234', branchId: 'branch-alpha' }) }),
      { DB: db },
    );
    const opJson = (await opVerify.json()) as { data: { sessionToken: string } };
    operatorSessionToken = opJson.data.sessionToken;

    await handleSetPin(
      new Request('http://localhost/', { method: 'POST', headers: { Authorization: bearerToken('fb-owner', 'owner@melt.local', 'Owner'), 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '9999' }) }),
      { DB: db },
    );
    const ownerVerify = await handleVerifyPin(
      new Request('http://localhost/', { method: 'POST', headers: { Authorization: bearerToken('fb-owner', 'owner@melt.local', 'Owner'), 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '9999', scope: 'GLOBAL' }) }),
      { DB: db },
    );
    const ownerJson = (await ownerVerify.json()) as { data: { sessionToken: string } };
    ownerSessionToken = ownerJson.data.sessionToken;
  });

  // ─── Catalog ────────────────────────────────────────────────────────────────

  describe('Catalog Endpoint', () => {
    it('returns catalog grouped by category (no auth required)', async () => {
      const resp = await handleBranchCatalogRoute(
        new Request('http://x/api/v1/branches/branch-alpha/catalog'),
        'branch-alpha',
        { DB: db },
      );
      assert.strictEqual(resp.status, 200);
      const json = (await resp.json()) as { success: boolean; data: { catalog: Array<{ products: unknown[] }> } };
      assert.strictEqual(json.success, true);
      assert.ok(json.data.catalog.length >= 1);
      assert.ok(json.data.catalog[0].products.length >= 1);
    });
  });

  // ─── Customer: Create Order ─────────────────────────────────────────────────

  describe('Customer: Create Order', () => {
    it('creates an order and returns 201 with correct total', async () => {
      const resp = await handleCreateOrderRoute(
        new Request('http://x/', {
          method: 'POST',
          headers: { Authorization: bearerToken('fb-cust', 'cust@melt.local', 'Customer'), 'Content-Type': 'application/json' },
          body: JSON.stringify({ branchId: 'branch-alpha', items: [{ productId: 'prod-a1', quantity: 2 }] }),
        }),
        { DB: db },
      );
      assert.strictEqual(resp.status, 201);
      const json = (await resp.json()) as { success: boolean; data: { order: { total: number; status: string }; expiresAt: string } };
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.order.total, 210); // 2×100 + 5% tax
      assert.strictEqual(json.data.order.status, OrderStatus.PENDING);
      assert.ok(json.data.expiresAt);
    });

    it('rejects missing branchId — 400 validation', async () => {
      const resp = await handleCreateOrderRoute(
        new Request('http://x/', {
          method: 'POST',
          headers: { Authorization: bearerToken('fb-cust', 'cust@melt.local', 'Customer'), 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: [{ productId: 'prod-a1', quantity: 1 }] }),
        }),
        { DB: db },
      );
      assert.strictEqual(resp.status, 400);
    });

    it('rejects product from a different branch — 400', async () => {
      // prod-beta-x does not exist in alpha branch catalog
      const resp = await handleCreateOrderRoute(
        new Request('http://x/', {
          method: 'POST',
          headers: { Authorization: bearerToken('fb-cust', 'cust@melt.local', 'Customer'), 'Content-Type': 'application/json' },
          body: JSON.stringify({ branchId: 'branch-alpha', items: [{ productId: 'non-existent-product', quantity: 1 }] }),
        }),
        { DB: db },
      );
      assert.strictEqual(resp.status, 400);
    });

    it('rejects unauthenticated request — 401', async () => {
      const resp = await handleCreateOrderRoute(
        new Request('http://x/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ branchId: 'branch-alpha', items: [{ productId: 'prod-a1', quantity: 1 }] }),
        }),
        { DB: db },
      );
      assert.strictEqual(resp.status, 401);
    });
  });

  // ─── Customer: List Orders ──────────────────────────────────────────────────

  describe('Customer: List Own Orders', () => {
    it('returns only authenticated customer orders', async () => {
      await handleCreateOrderRoute(
        new Request('http://x/', {
          method: 'POST',
          headers: { Authorization: bearerToken('fb-cust', 'cust@melt.local', 'Customer'), 'Content-Type': 'application/json' },
          body: JSON.stringify({ branchId: 'branch-alpha', items: [{ productId: 'prod-a1', quantity: 1 }] }),
        }),
        { DB: db },
      );

      const resp = await handleCustomerOrdersRoute(
        new Request('http://x/', { headers: { Authorization: bearerToken('fb-cust', 'cust@melt.local', 'Customer') } }),
        { DB: db },
      );
      assert.strictEqual(resp.status, 200);
      const json = (await resp.json()) as { data: unknown[] };
      assert.strictEqual(json.data.length, 1);
    });

    it('forbids customer from viewing another customer via query param — 403', async () => {
      const resp = await handleCustomerOrdersRoute(
        new Request('http://x/?customer_user_id=usr-op', {
          headers: { Authorization: bearerToken('fb-cust', 'cust@melt.local', 'Customer') },
        }),
        { DB: db },
      );
      assert.strictEqual(resp.status, 403);
    });
  });

  // ─── Customer: Edit Order ───────────────────────────────────────────────────

  // ─── Customer: Edit Order ───────────────────────────────────────────────────

  describe('Customer: Edit Order', () => {
    it('strictly forbids customer from editing order — 403 Forbidden', async () => {
      const createResp = await handleCreateOrderRoute(
        new Request('http://x/', {
          method: 'POST',
          headers: { Authorization: bearerToken('fb-cust', 'cust@melt.local', 'Customer'), 'Content-Type': 'application/json' },
          body: JSON.stringify({ branchId: 'branch-alpha', items: [{ productId: 'prod-a1', quantity: 1 }] }),
        }),
        { DB: db },
      );
      const { data: cd } = (await createResp.json()) as { data: { order: { id: string } } };
      const orderId = cd.order.id;

      const editResp = await handleEditOrderRoute(
        new Request(`http://x/${orderId}`, {
          method: 'PATCH',
          headers: { Authorization: bearerToken('fb-cust', 'cust@melt.local', 'Customer'), 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: [{ productId: 'prod-a1', quantity: 2 }, { productId: 'prod-a2', quantity: 1 }] }),
        }),
        orderId,
        { DB: db },
      );
      assert.strictEqual(editResp.status, 403);
      const json = (await editResp.json()) as { success: boolean; error: { code: string; message: string } };
      assert.strictEqual(json.success, false);
      assert.strictEqual(json.error.code, 'FORBIDDEN');
    });
  });

  // ─── Branch Operator: Order Queue ───────────────────────────────────────────

  describe('Branch Operator: Order Queue', () => {
    it('rejects request without session token — 401', async () => {
      const resp = await handleBranchOrdersRoute(
        new Request('http://x/', { headers: { Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator') } }),
        'branch-alpha',
        { DB: db },
      );
      assert.strictEqual(resp.status, 401);
    });

    it('allows operator with valid session to list orders', async () => {
      await handleCreateOrderRoute(
        new Request('http://x/', {
          method: 'POST',
          headers: { Authorization: bearerToken('fb-cust', 'cust@melt.local', 'Customer'), 'Content-Type': 'application/json' },
          body: JSON.stringify({ branchId: 'branch-alpha', items: [{ productId: 'prod-a1', quantity: 1 }] }),
        }),
        { DB: db },
      );

      const resp = await handleBranchOrdersRoute(
        new Request('http://x/', {
          headers: { Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'), 'x-session-token': operatorSessionToken },
        }),
        'branch-alpha',
        { DB: db },
      );
      assert.strictEqual(resp.status, 200);
      const json = (await resp.json()) as { data: unknown[] };
      assert.ok(json.data.length >= 1);
    });

    it('forbids operator from accessing a different branch — 403', async () => {
      const resp = await handleBranchOrdersRoute(
        new Request('http://x/', {
          headers: { Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'), 'x-session-token': operatorSessionToken },
        }),
        'branch-beta',
        { DB: db },
      );
      assert.strictEqual(resp.status, 403);
    });

    it('owner with GLOBAL session can access any branch', async () => {
      const resp = await handleBranchOrdersRoute(
        new Request('http://x/', {
          headers: { Authorization: bearerToken('fb-owner', 'owner@melt.local', 'Owner'), 'x-session-token': ownerSessionToken },
        }),
        'branch-beta',
        { DB: db },
      );
      assert.strictEqual(resp.status, 200);
    });

    it('allows operator to directly book order with selectable stages (PENDING, CONFIRMED, PREPARING, READY, COMPLETED)', async () => {
      // 1. Book with initialStatus: PENDING
      const respPending = await handleBranchOrdersRoute(
        new Request('http://x/', {
          method: 'POST',
          headers: {
            Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'),
            'x-session-token': operatorSessionToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            items: [{ productId: 'prod-a1', quantity: 1 }],
            initialStatus: 'PENDING',
          }),
        }),
        'branch-alpha',
        { DB: db },
      );
      assert.strictEqual(respPending.status, 201);
      const jsonPending = (await respPending.json()) as { data: { order: { status: string; payment_status: string } } };
      assert.strictEqual(jsonPending.data.order.status, 'PENDING');
      assert.strictEqual(jsonPending.data.order.payment_status, 'PENDING');

      // 2. Book with initialStatus: CONFIRMED (Payment done)
      const respConfirmed = await handleBranchOrdersRoute(
        new Request('http://x/', {
          method: 'POST',
          headers: {
            Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'),
            'x-session-token': operatorSessionToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            items: [{ productId: 'prod-a1', quantity: 1 }],
            initialStatus: 'CONFIRMED',
            paymentMethod: 'CASH',
            paymentNotes: 'Counter Walk-in Cash',
          }),
        }),
        'branch-alpha',
        { DB: db },
      );
      assert.strictEqual(respConfirmed.status, 201);
      const jsonConfirmed = (await respConfirmed.json()) as { data: { order: { status: string; payment_status: string } } };
      assert.strictEqual(jsonConfirmed.data.order.status, 'CONFIRMED');
      assert.strictEqual(jsonConfirmed.data.order.payment_status, 'VERIFIED');

      // 3. Book with initialStatus: READY
      const respReady = await handleBranchOrdersRoute(
        new Request('http://x/', {
          method: 'POST',
          headers: {
            Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'),
            'x-session-token': operatorSessionToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            items: [{ productId: 'prod-a1', quantity: 1 }],
            initialStatus: 'READY',
            paymentMethod: 'UPI',
          }),
        }),
        'branch-alpha',
        { DB: db },
      );
      assert.strictEqual(respReady.status, 201);
      const jsonReady = (await respReady.json()) as { data: { order: { status: string; payment_status: string } } };
      assert.strictEqual(jsonReady.data.order.status, 'READY');
      assert.strictEqual(jsonReady.data.order.payment_status, 'VERIFIED');

      // 4. Book with initialStatus: COMPLETED (Collected)
      const respCompleted = await handleBranchOrdersRoute(
        new Request('http://x/', {
          method: 'POST',
          headers: {
            Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'),
            'x-session-token': operatorSessionToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            items: [{ productId: 'prod-a1', quantity: 1 }],
            initialStatus: 'COMPLETED',
            paymentMethod: 'CARD',
          }),
        }),
        'branch-alpha',
        { DB: db },
      );
      assert.strictEqual(respCompleted.status, 201);
      const jsonCompleted = (await respCompleted.json()) as { data: { order: { status: string; payment_status: string } } };
      assert.strictEqual(jsonCompleted.data.order.status, 'COMPLETED');
      assert.strictEqual(jsonCompleted.data.order.payment_status, 'VERIFIED');
    });
  });

  // ─── Branch Operator: Full Payment → Confirm Workflow ───────────────────────

  describe('Branch Operator: Payment → Verify → Confirm', () => {
    async function createOrder(): Promise<string> {
      const resp = await handleCreateOrderRoute(
        new Request('http://x/', {
          method: 'POST',
          headers: { Authorization: bearerToken('fb-cust', 'cust@melt.local', 'Customer'), 'Content-Type': 'application/json' },
          body: JSON.stringify({ branchId: 'branch-alpha', items: [{ productId: 'prod-a1', quantity: 1 }] }),
        }),
        { DB: db },
      );
      const json = (await resp.json()) as { data: { order: { id: string } } };
      return json.data.order.id;
    }

    it('records payment at reception — 201 with RECORDED status', async () => {
      const orderId = await createOrder();

      const resp = await handleRecordPaymentRoute(
        new Request('http://x/', {
          method: 'POST',
          headers: {
            Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'),
            'x-session-token': operatorSessionToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ amount: 105, method: PaymentMethod.CASH }),
        }),
        'branch-alpha',
        orderId,
        { DB: db },
      );
      assert.strictEqual(resp.status, 201);
      const json = (await resp.json()) as { data: { payment: { status: string }; order: { payment_status: string } } };
      assert.strictEqual(json.data.payment.status, PaymentStatus.RECORDED);
      assert.strictEqual(json.data.order.payment_status, PaymentStatus.RECORDED);
    });

    it('full payment workflow — record → verify → confirm', async () => {
      const orderId = await createOrder();
      const opHeaders = { Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'), 'x-session-token': operatorSessionToken, 'Content-Type': 'application/json' };

      // Record payment
      const recResp = await handleRecordPaymentRoute(
        new Request('http://x/', { method: 'POST', headers: opHeaders, body: JSON.stringify({ amount: 105, method: PaymentMethod.UPI }) }),
        'branch-alpha', orderId, { DB: db },
      );
      const { data: rd } = (await recResp.json()) as { data: { payment: { id: string } } };
      const paymentId = rd.payment.id;

      // Verify payment
      const verResp = await handleVerifyPaymentRoute(
        new Request('http://x/', { method: 'POST', headers: opHeaders, body: JSON.stringify({}) }),
        'branch-alpha', orderId, paymentId, { DB: db },
      );
      assert.strictEqual(verResp.status, 200);
      const { data: vd } = (await verResp.json()) as { data: { order: { payment_status: string } } };
      assert.strictEqual(vd.order.payment_status, PaymentStatus.VERIFIED);

      // Confirm order
      const confResp = await handleBranchOrderConfirmRoute(
        new Request('http://x/', { method: 'POST', headers: opHeaders }),
        'branch-alpha', orderId, { DB: db },
      );
      assert.strictEqual(confResp.status, 200);
      const { data: cd } = (await confResp.json()) as { data: { order: { status: string } } };
      assert.strictEqual(cd.order.status, OrderStatus.CONFIRMED);
    });

    it('rejects confirm when payment is not yet verified — 400', async () => {
      const orderId = await createOrder();

      const resp = await handleBranchOrderConfirmRoute(
        new Request('http://x/', {
          method: 'POST',
          headers: { Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'), 'x-session-token': operatorSessionToken },
        }),
        'branch-alpha', orderId, { DB: db },
      );
      assert.strictEqual(resp.status, 400);
    });

    it('operator transitions order through status machine: CONFIRMED → PREPARING → READY → COMPLETED', async () => {
      const orderId = await createOrder();
      const opHeaders = { Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'), 'x-session-token': operatorSessionToken, 'Content-Type': 'application/json' };

      // Pay + Verify + Confirm
      const recResp = await handleRecordPaymentRoute(new Request('http://x/', { method: 'POST', headers: opHeaders, body: JSON.stringify({ amount: 105, method: PaymentMethod.CASH }) }), 'branch-alpha', orderId, { DB: db });
      const { data: rd } = (await recResp.json()) as { data: { payment: { id: string } } };
      await handleVerifyPaymentRoute(new Request('http://x/', { method: 'POST', headers: opHeaders, body: JSON.stringify({}) }), 'branch-alpha', orderId, rd.payment.id, { DB: db });
      await handleBranchOrderConfirmRoute(new Request('http://x/', { method: 'POST', headers: opHeaders }), 'branch-alpha', orderId, { DB: db });

      const transitions: Array<{ to: string }> = [
        { to: OrderStatus.PREPARING },
        { to: OrderStatus.READY },
        { to: OrderStatus.COMPLETED },
      ];

      for (const { to } of transitions) {
        const resp = await handleBranchOrderStatusRoute(
          new Request('http://x/', { method: 'PATCH', headers: opHeaders, body: JSON.stringify({ status: to }) }),
          'branch-alpha', orderId, { DB: db },
        );
        assert.strictEqual(resp.status, 200, `Expected 200 on transition to ${to}`);
        const json = (await resp.json()) as { data: { status: string } };
        assert.strictEqual(json.data.status, to);
      }
    });

    it('rejects confirmation attempt through generic status endpoint — 400', async () => {
      const orderId = await createOrder();
      const opHeaders = {
        Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'),
        'x-session-token': operatorSessionToken,
        'Content-Type': 'application/json',
      };

      const resp = await handleBranchOrderStatusRoute(
        new Request('http://x/', { method: 'PATCH', headers: opHeaders, body: JSON.stringify({ status: OrderStatus.CONFIRMED }) }),
        'branch-alpha',
        orderId,
        { DB: db },
      );
      assert.strictEqual(resp.status, 400);
    });

    it('rejects confirm when verified payment amount is less than order total — 400', async () => {
      const orderId = await createOrder();
      const opHeaders = {
        Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'),
        'x-session-token': operatorSessionToken,
      };

      // Manually insert an underpaid verified payment into DB
      const payId = 'pay-underpaid';
      const now = new Date().toISOString();
      await db
        .prepare("INSERT INTO payments (id, order_id, branch_id, method, amount, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'VERIFIED', ?, ?)")
        .bind(payId, orderId, 'branch-alpha', PaymentMethod.CASH, 50, now, now)
        .run();
      await db.prepare("UPDATE orders SET payment_status = 'VERIFIED' WHERE id = ?").bind(orderId).run();

      const resp = await handleBranchOrderConfirmRoute(
        new Request('http://x/', { method: 'POST', headers: opHeaders }),
        'branch-alpha',
        orderId,
        { DB: db },
      );
      assert.strictEqual(resp.status, 400);
    });
  });

  // ─── Branch Operator: Order Editing & Strict Payment Validation ─────────────

  describe('Branch Operator: Order Editing & Strict Payment Validation', () => {
    async function createAlphaOrder(): Promise<{ orderId: string; total: number }> {
      const resp = await handleCreateOrderRoute(
        new Request('http://x/api/v1/customer/orders', {
          method: 'POST',
          headers: {
            Authorization: bearerToken('fb-cust', 'cust@melt.local', 'Customer'),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            branchId: 'branch-alpha',
            items: [{ productId: 'prod-a1', quantity: 1 }],
          }),
        }),
        { DB: db },
      );
      const json = (await resp.json()) as { data: { order: { id: string; total: number } } };
      return { orderId: json.data.order.id, total: json.data.order.total };
    }

    it('allows operator to edit order and recalculates totals correctly', async () => {
      const { orderId } = await createAlphaOrder();

      const resp = await handleBranchOrderEditRoute(
        new Request(`http://x/api/v1/branches/branch-alpha/orders/${orderId}`, {
          method: 'PATCH',
          headers: {
            Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'),
            'x-session-token': operatorSessionToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            items: [{ productId: 'prod-a1', quantity: 3 }],
          }),
        }),
        'branch-alpha',
        orderId,
        { DB: db },
      );

      assert.strictEqual(resp.status, 200);
      const json = (await resp.json()) as {
        data: { newTotal: number; previousTotal: number; items: unknown[] };
      };
      assert.ok(json.data.newTotal > json.data.previousTotal);
      assert.strictEqual(json.data.items.length, 1);
    });

    it('allows owner with global session to edit order in branch-alpha', async () => {
      const { orderId } = await createAlphaOrder();

      const resp = await handleBranchOrderEditRoute(
        new Request(`http://x/api/v1/branches/branch-alpha/orders/${orderId}`, {
          method: 'PATCH',
          headers: {
            Authorization: bearerToken('fb-owner', 'owner@melt.local', 'Owner'),
            'x-session-token': ownerSessionToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            items: [{ productId: 'prod-a2', quantity: 2 }],
          }),
        }),
        'branch-alpha',
        orderId,
        { DB: db },
      );

      assert.strictEqual(resp.status, 200);
    });

    it('forbids operator of branch-alpha from editing branch-beta order — 403', async () => {
      const resp = await handleBranchOrderEditRoute(
        new Request('http://x/api/v1/branches/branch-beta/orders/ord-fake', {
          method: 'PATCH',
          headers: {
            Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'),
            'x-session-token': operatorSessionToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            items: [{ productId: 'prod-a1', quantity: 1 }],
          }),
        }),
        'branch-beta',
        'ord-fake',
        { DB: db },
      );

      assert.strictEqual(resp.status, 403);
    });

    it('forbids customer from calling operator edit endpoint — 403 or 401', async () => {
      const { orderId } = await createAlphaOrder();

      const resp = await handleBranchOrderEditRoute(
        new Request(`http://x/api/v1/branches/branch-alpha/orders/${orderId}`, {
          method: 'PATCH',
          headers: {
            Authorization: bearerToken('fb-cust', 'cust@melt.local', 'Customer'),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            items: [{ productId: 'prod-a1', quantity: 2 }],
          }),
        }),
        'branch-alpha',
        orderId,
        { DB: db },
      );

      assert.ok(resp.status === 401 || resp.status === 403);
    });

    it('rejects underpayment and overpayment when recording payment — 400', async () => {
      const { orderId, total } = await createAlphaOrder();
      const opHeaders = {
        Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'),
        'x-session-token': operatorSessionToken,
        'Content-Type': 'application/json',
      };

      // Underpayment
      const underResp = await handleRecordPaymentRoute(
        new Request('http://x/', {
          method: 'POST',
          headers: opHeaders,
          body: JSON.stringify({ amount: total - 10, method: PaymentMethod.CASH }),
        }),
        'branch-alpha',
        orderId,
        { DB: db },
      );
      assert.strictEqual(underResp.status, 400);

      // Overpayment
      const overResp = await handleRecordPaymentRoute(
        new Request('http://x/', {
          method: 'POST',
          headers: opHeaders,
          body: JSON.stringify({ amount: total + 100, method: PaymentMethod.CASH }),
        }),
        'branch-alpha',
        orderId,
        { DB: db },
      );
      assert.strictEqual(overResp.status, 400);
    });

    it('rejects payment on expired order — 400', async () => {
      const { orderId, total } = await createAlphaOrder();
      const opHeaders = {
        Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'),
        'x-session-token': operatorSessionToken,
        'Content-Type': 'application/json',
      };

      // Expire order in DB
      const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      await db.prepare("UPDATE orders SET status = 'EXPIRED', expires_at = ? WHERE id = ?").bind(past, orderId).run();

      const resp = await handleRecordPaymentRoute(
        new Request('http://x/', {
          method: 'POST',
          headers: opHeaders,
          body: JSON.stringify({ amount: total, method: PaymentMethod.CASH }),
        }),
        'branch-alpha',
        orderId,
        { DB: db },
      );

      assert.strictEqual(resp.status, 400);
    });

    it('allows operator to edit order after confirmation', async () => {
      const { orderId, total } = await createAlphaOrder();
      const opHeaders = {
        Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'),
        'x-session-token': operatorSessionToken,
        'Content-Type': 'application/json',
      };

      // Pay -> Verify -> Confirm
      const payResp = await handleRecordPaymentRoute(
        new Request('http://x/', { method: 'POST', headers: opHeaders, body: JSON.stringify({ amount: total, method: PaymentMethod.CASH }) }),
        'branch-alpha',
        orderId,
        { DB: db },
      );
      const { data: pd } = (await payResp.json()) as { data: { payment: { id: string } } };

      await handleVerifyPaymentRoute(
        new Request('http://x/', { method: 'POST', headers: opHeaders, body: JSON.stringify({}) }),
        'branch-alpha',
        orderId,
        pd.payment.id,
        { DB: db },
      );

      await handleBranchOrderConfirmRoute(
        new Request('http://x/', { method: 'POST', headers: opHeaders }),
        'branch-alpha',
        orderId,
        { DB: db },
      );

      // Edit confirmed order
      const editResp = await handleBranchOrderEditRoute(
        new Request(`http://x/api/v1/branches/branch-alpha/orders/${orderId}`, {
          method: 'PATCH',
          headers: opHeaders,
          body: JSON.stringify({
            items: [{ productId: 'prod-a1', quantity: 2 }],
          }),
        }),
        'branch-alpha',
        orderId,
        { DB: db },
      );

      assert.strictEqual(editResp.status, 200);
      const editJson = (await editResp.json()) as {
        data: { order: { status: string }; additionalAmountRequired: number };
      };
      assert.strictEqual(editJson.data.order.status, OrderStatus.CONFIRMED);
      assert.ok(editJson.data.additionalAmountRequired > 0);
    });
  });
});

