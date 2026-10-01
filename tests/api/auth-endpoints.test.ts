import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createMemoryD1Database } from '../../database/adapter.sqlite';
import { runMigrations } from '../../database/migrations/runner';
import { UserRepository } from '../../database/repositories/user.repository';
import { BranchRepository } from '../../database/repositories/branch.repository';
import { OrderRepository } from '../../database/repositories/order.repository';
import { UserRole, MembershipStatus } from '../../shared/enums/roles.enum';
import { handleAuthLogin, handleSetPin, handleVerifyPin } from '../../api/routes/auth.route';
import { handleBranchOrdersRoute } from '../../api/routes/branch-orders.route';
import { handleCustomerOrdersRoute } from '../../api/routes/customer-orders.route';
import { D1DatabaseLike } from '../../database/types';

describe('API Auth, RBAC & Multi-Branch Endpoints', () => {
  let db: D1DatabaseLike;
  let userRepo: UserRepository;
  let branchRepo: BranchRepository;
  let orderRepo: OrderRepository;

  beforeEach(async () => {
    db = createMemoryD1Database();
    const migrationsDir = path.resolve(process.cwd(), 'database', 'migrations');
    await runMigrations(db, migrationsDir);

    userRepo = new UserRepository(db);
    branchRepo = new BranchRepository(db);
    orderRepo = new OrderRepository(db);

    // Setup branches
    await branchRepo.create({ id: 'branch-alpha', name: 'Alpha Branch', code: 'ALPHA' });
    await branchRepo.create({ id: 'branch-beta', name: 'Beta Branch', code: 'BETA' });

    // Setup operator for branch-alpha
    const opUser = await userRepo.create({
      id: 'usr-op-alpha',
      firebase_uid: 'fb-op-alpha',
      email: 'operator.alpha@melt.local',
      display_name: 'Alpha Operator',
      role: UserRole.CUSTOMER,
    });
    await userRepo.addMembership('mem-op-alpha', opUser.id, 'branch-alpha', UserRole.BRANCH_OPERATOR, MembershipStatus.ACTIVE);

    // Setup owner
    await userRepo.create({
      id: 'usr-owner',
      firebase_uid: 'fb-owner',
      email: 'owner@melt.local',
      display_name: 'Owner Boss',
      role: UserRole.OWNER,
    });

    // Setup customer with an order
    const custUser = await userRepo.create({
      id: 'usr-customer-1',
      firebase_uid: 'fb-customer-1',
      email: 'customer1@melt.local',
      display_name: 'Customer 1',
      role: UserRole.CUSTOMER,
    });

    // Create a product and an order for customer 1
    await db
      .prepare(`
        INSERT INTO categories (id, branch_id, name, created_at, updated_at)
        VALUES ('cat-1', 'branch-alpha', 'Cups', ?, ?)
      `)
      .bind(new Date().toISOString(), new Date().toISOString())
      .run();

    await db
      .prepare(`
        INSERT INTO products (id, branch_id, category_id, name, price, created_at, updated_at)
        VALUES ('prod-1', 'branch-alpha', 'cat-1', 'Mango Sorbet', 120, ?, ?)
      `)
      .bind(new Date().toISOString(), new Date().toISOString())
      .run();

    await orderRepo.create({
      id: 'ord-101',
      order_number: 'ORD-101',
      branch_id: 'branch-alpha',
      customer_user_id: custUser.id,
      subtotal: 120,
      total: 120,
      expires_at: new Date(Date.now() + 900000).toISOString(),
      items: [
        {
          id: 'item-1',
          product_id: 'prod-1',
          product_name_snapshot: 'Mango Sorbet',
          unit_price_snapshot: 120,
          quantity: 1,
          line_total: 120,
        },
      ],
    });
  });

  describe('Authentication Endpoints', () => {
    it('rejects login request with missing Authorization header with 401', async () => {
      const request = new Request('http://localhost:3000/api/v1/auth/login', {
        method: 'POST',
      });
      const response = await handleAuthLogin(request, { DB: db });
      assert.strictEqual(response.status, 401);
    });

    it('rejects login request with invalid token format with 401', async () => {
      const request = new Request('http://localhost:3000/api/v1/auth/login', {
        method: 'POST',
        headers: { Authorization: 'Bearer not.a.valid.jwt' },
      });
      const response = await handleAuthLogin(request, { DB: db });
      assert.strictEqual(response.status, 401);
    });

    it('logs in successfully and returns user role and memberships', async () => {
      const request = new Request('http://localhost:3000/api/v1/auth/login', {
        method: 'POST',
        headers: { Authorization: 'Bearer mock-user:fb-op-alpha:operator.alpha@melt.local:Alpha Operator' },
      });
      const response = await handleAuthLogin(request, { DB: db });
      assert.strictEqual(response.status, 200);

      const json = (await response.json()) as { success: boolean; data: { user: { role: string }; memberships: any[] } };
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.user.role, UserRole.BRANCH_OPERATOR);
      assert.strictEqual(json.data.memberships.length, 1);
      assert.strictEqual(json.data.memberships[0].branchId, 'branch-alpha');
    });

    it('sets user PIN and verifies PIN to receive application session', async () => {
      // 1. Set PIN
      const setPinReq = new Request('http://localhost:3000/api/v1/auth/pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-user:fb-op-alpha:operator.alpha@melt.local:Alpha Operator',
        },
        body: JSON.stringify({ pin: '5555' }),
      });
      const setPinRes = await handleSetPin(setPinReq, { DB: db });
      assert.strictEqual(setPinRes.status, 200);

      // 2. Verify PIN
      const verifyReq = new Request('http://localhost:3000/api/v1/auth/verify-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-user:fb-op-alpha:operator.alpha@melt.local:Alpha Operator',
        },
        body: JSON.stringify({ pin: '5555', branchId: 'branch-alpha' }),
      });
      const verifyRes = await handleVerifyPin(verifyReq, { DB: db });
      assert.strictEqual(verifyRes.status, 200);

      const json = (await verifyRes.json()) as { success: boolean; data: { sessionToken: string; scope: string } };
      assert.strictEqual(json.success, true);
      assert.ok(json.data.sessionToken);
      assert.strictEqual(json.data.scope, 'BRANCH');
    });
  });

  describe('Protected Branch Authorization Path', () => {
    it('allows Operator of Branch Alpha to access Branch Alpha orders', async () => {
      const request = new Request('http://localhost:3000/api/v1/branches/branch-alpha/orders', {
        method: 'GET',
        headers: { Authorization: 'Bearer mock-user:fb-op-alpha:operator.alpha@melt.local:Alpha Operator' },
      });
      const response = await handleBranchOrdersRoute(request, 'branch-alpha', { DB: db });
      assert.strictEqual(response.status, 200);

      const json = (await response.json()) as { success: boolean; data: any[] };
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.length, 1);
      assert.strictEqual(json.data[0].id, 'ord-101');
    });

    it('forbids Operator of Branch Alpha from accessing Branch Beta orders (cross-branch rejection)', async () => {
      const request = new Request('http://localhost:3000/api/v1/branches/branch-beta/orders', {
        method: 'GET',
        headers: { Authorization: 'Bearer mock-user:fb-op-alpha:operator.alpha@melt.local:Alpha Operator' },
      });
      const response = await handleBranchOrdersRoute(request, 'branch-beta', { DB: db });
      assert.strictEqual(response.status, 403, 'Cross-branch access must return 403 Forbidden');
    });

    it('forbids Customer from accessing Branch orders', async () => {
      const request = new Request('http://localhost:3000/api/v1/branches/branch-alpha/orders', {
        method: 'GET',
        headers: { Authorization: 'Bearer mock-user:fb-customer-1:customer1@melt.local:Customer 1' },
      });
      const response = await handleBranchOrdersRoute(request, 'branch-alpha', { DB: db });
      assert.strictEqual(response.status, 403, 'Customer role must be denied branch management APIs');
    });

    it('allows Owner to access both Branch Alpha and Branch Beta', async () => {
      const reqAlpha = new Request('http://localhost:3000/api/v1/branches/branch-alpha/orders', {
        method: 'GET',
        headers: { Authorization: 'Bearer mock-user:fb-owner:owner@melt.local:Owner Boss' },
      });
      const resAlpha = await handleBranchOrdersRoute(reqAlpha, 'branch-alpha', { DB: db });
      assert.strictEqual(resAlpha.status, 200);

      const reqBeta = new Request('http://localhost:3000/api/v1/branches/branch-beta/orders', {
        method: 'GET',
        headers: { Authorization: 'Bearer mock-user:fb-owner:owner@melt.local:Owner Boss' },
      });
      const resBeta = await handleBranchOrdersRoute(reqBeta, 'branch-beta', { DB: db });
      assert.strictEqual(resBeta.status, 200);
    });
  });

  describe('Protected Customer Data Authorization Path', () => {
    it('allows Customer to view their own orders', async () => {
      const request = new Request('http://localhost:3000/api/v1/customer/orders', {
        method: 'GET',
        headers: { Authorization: 'Bearer mock-user:fb-customer-1:customer1@melt.local:Customer 1' },
      });
      const response = await handleCustomerOrdersRoute(request, { DB: db });
      assert.strictEqual(response.status, 200);

      const json = (await response.json()) as { success: boolean; data: any[] };
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.length, 1);
      assert.strictEqual(json.data[0].id, 'ord-101');
    });

    it('forbids Customer from querying another customer ID via query param', async () => {
      const request = new Request('http://localhost:3000/api/v1/customer/orders?customer_user_id=usr-other-victim', {
        method: 'GET',
        headers: { Authorization: 'Bearer mock-user:fb-customer-1:customer1@melt.local:Customer 1' },
      });
      const response = await handleCustomerOrdersRoute(request, { DB: db });
      assert.strictEqual(response.status, 403, 'Spoofing another customer ID must return 403 Forbidden');
    });

    it('allows Owner to inspect any customer orders', async () => {
      const request = new Request('http://localhost:3000/api/v1/customer/orders?customer_user_id=usr-customer-1', {
        method: 'GET',
        headers: { Authorization: 'Bearer mock-user:fb-owner:owner@melt.local:Owner Boss' },
      });
      const response = await handleCustomerOrdersRoute(request, { DB: db });
      assert.strictEqual(response.status, 200);

      const json = (await response.json()) as { success: boolean; data: any[] };
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.length, 1);
    });
  });
});
