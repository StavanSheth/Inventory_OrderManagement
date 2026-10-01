(process.env as Record<string, string | undefined>).NODE_ENV = 'test';

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createMemoryD1Database } from '../../database/adapter.sqlite';
import { runMigrations } from '../../database/migrations/runner';
import { UserRepository } from '../../database/repositories/user.repository';
import { BranchRepository } from '../../database/repositories/branch.repository';
import { OrderRepository } from '../../database/repositories/order.repository';
import { SessionRepository } from '../../database/repositories/session.repository';
import { UserRole, MembershipStatus } from '../../shared/enums/roles.enum';
import {
  handleAuthLogin,
  handleSetPin,
  handleVerifyPin,
  handleRevokeSession,
  handleRevokeAllSessions,
} from '../../api/routes/auth.route';
import { handleBranchOrdersRoute } from '../../api/routes/branch-orders.route';
import { handleCustomerOrdersRoute } from '../../api/routes/customer-orders.route';
import { hashPin } from '../../backend/services/auth/pin-hasher';
import { D1DatabaseLike } from '../../database/types';

describe('API Auth, RBAC & Multi-Branch Endpoints', () => {
  let db: D1DatabaseLike;
  let userRepo: UserRepository;
  let branchRepo: BranchRepository;
  let orderRepo: OrderRepository;
  let _sessionRepo: SessionRepository;
  let operatorSessionToken: string;
  let operatorSessionId: string;
  let ownerSessionToken: string;
  let ownerSessionId: string;

  beforeEach(async () => {
    db = createMemoryD1Database();
    const migrationsDir = path.resolve(process.cwd(), 'database', 'migrations');
    await runMigrations(db, migrationsDir);

    userRepo = new UserRepository(db);
    branchRepo = new BranchRepository(db);
    orderRepo = new OrderRepository(db);
    _sessionRepo = new SessionRepository(db);

    // Setup branches and timeouts
    await branchRepo.create({ id: 'branch-alpha', name: 'Alpha Branch', code: 'ALPHA' });
    await branchRepo.create({ id: 'branch-beta', name: 'Beta Branch', code: 'BETA' });

    await db
      .prepare(`
        INSERT INTO branch_settings (id, branch_id, session_timeout_value, session_timeout_unit, order_expiry_minutes, order_edit_window_minutes, updated_at)
        VALUES ('bs-alpha', 'branch-alpha', 4, 'HOURS', 15, 60, ?),
               ('bs-beta', 'branch-beta', 4, 'HOURS', 15, 60, ?)
      `)
      .bind(new Date().toISOString(), new Date().toISOString())
      .run();

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
    const ownerUser = await userRepo.create({
      id: 'usr-owner',
      firebase_uid: 'fb-owner',
      email: 'owner@melt.local',
      display_name: 'Owner Boss',
      role: UserRole.OWNER,
    });
    await userRepo.setPinHash(ownerUser.id, await hashPin('9999'));

    // Setup customer with an order
    const custUser = await userRepo.create({
      id: 'usr-customer-1',
      firebase_uid: 'fb-customer-1',
      email: 'customer1@melt.local',
      display_name: 'Customer 1',
      role: UserRole.CUSTOMER,
    });

    await db
      .prepare(`
        INSERT INTO customer_profiles (id, user_id, preferred_branch_id, marketing_opt_in, created_at, updated_at)
        VALUES ('prof-1', ?, 'branch-alpha', 0, ?, ?)
      `)
      .bind(custUser.id, new Date().toISOString(), new Date().toISOString())
      .run();

    await orderRepo.create({
      id: 'ord-101',
      branch_id: 'branch-alpha',
      customer_user_id: custUser.id,
      order_number: 'ORD-101',
      subtotal: 250,
      discount: 0,
      tax: 12.5,
      total: 262.5,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      items: [],
    });
  });

  describe('Authentication Endpoints', () => {
    it('rejects login request with missing Authorization header with 401', async () => {
      const request = new Request('http://localhost:3000/api/v1/auth/login', {
        method: 'POST',
      });
      const response = await handleAuthLogin(request, { DB: db });
      assert.strictEqual(response.status, 401);

      const json = (await response.json()) as { success: boolean; error: { code: string } };
      assert.strictEqual(json.success, false);
      assert.strictEqual(json.error.code, 'UNAUTHORIZED');
    });

    it('rejects login request with invalid token format with 401', async () => {
      const request = new Request('http://localhost:3000/api/v1/auth/login', {
        method: 'POST',
        headers: { Authorization: 'Basic dXNlcjpwYXNz' },
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

    it('rejects CUSTOMER role from setting or verifying a PIN', async () => {
      const setPinReq = new Request('http://localhost:3000/api/v1/auth/pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-user:fb-customer-1:customer1@melt.local:Customer 1',
        },
        body: JSON.stringify({ pin: '1234' }),
      });
      const setPinRes = await handleSetPin(setPinReq, { DB: db });
      assert.strictEqual(setPinRes.status, 403, 'Customer role must not configure PIN');

      const verifyReq = new Request('http://localhost:3000/api/v1/auth/verify-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-user:fb-customer-1:customer1@melt.local:Customer 1',
        },
        body: JSON.stringify({ pin: '1234' }),
      });
      const verifyRes = await handleVerifyPin(verifyReq, { DB: db });
      assert.strictEqual(verifyRes.status, 403, 'Customer role must not verify PIN');
    });

    it('rejects non-numeric or invalid PIN formats with 400', async () => {
      const setPinReq = new Request('http://localhost:3000/api/v1/auth/pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-user:fb-op-alpha:operator.alpha@melt.local:Alpha Operator',
        },
        body: JSON.stringify({ pin: 'abcd' }),
      });
      const setPinRes = await handleSetPin(setPinReq, { DB: db });
      assert.strictEqual(setPinRes.status, 400);
    });
  });

  async function setupSessions() {
    // Set & verify operator PIN
    const setPinReq = new Request('http://localhost:3000/api/v1/auth/pin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer mock-user:fb-op-alpha:operator.alpha@melt.local:Alpha Operator',
      },
      body: JSON.stringify({ pin: '7777' }),
    });
    await handleSetPin(setPinReq, { DB: db });

    const verifyReq = new Request('http://localhost:3000/api/v1/auth/verify-pin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer mock-user:fb-op-alpha:operator.alpha@melt.local:Alpha Operator',
      },
      body: JSON.stringify({ pin: '7777', branchId: 'branch-alpha' }),
    });
    const verifyRes = await handleVerifyPin(verifyReq, { DB: db });
    const verifyJson = (await verifyRes.json()) as { data: { sessionId: string; sessionToken: string } };
    operatorSessionToken = verifyJson.data.sessionToken;
    operatorSessionId = verifyJson.data.sessionId;

    // Verify owner PIN with GLOBAL scope
    const ownerVerifyReq = new Request('http://localhost:3000/api/v1/auth/verify-pin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer mock-user:fb-owner:owner@melt.local:Owner Boss',
      },
      body: JSON.stringify({ pin: '9999', scope: 'GLOBAL' }),
    });
    const ownerVerifyRes = await handleVerifyPin(ownerVerifyReq, { DB: db });
    const ownerJson = (await ownerVerifyRes.json()) as { data: { sessionId: string; sessionToken: string } };
    ownerSessionToken = ownerJson.data.sessionToken;
    ownerSessionId = ownerJson.data.sessionId;
  }

  describe('Protected Branch Authorization Path with Session Enforcement', () => {
    beforeEach(setupSessions);

    it('rejects operational branch route when x-session-token is missing', async () => {
      const request = new Request('http://localhost:3000/api/v1/branches/branch-alpha/orders', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer mock-user:fb-op-alpha:operator.alpha@melt.local:Alpha Operator',
          // Missing x-session-token
        },
      });
      const response = await handleBranchOrdersRoute(request, 'branch-alpha', { DB: db });
      assert.strictEqual(response.status, 401, 'Protected operational route must require application PIN session');
    });

    it('allows Operator of Branch Alpha with valid branch session to access Branch Alpha orders', async () => {
      const request = new Request('http://localhost:3000/api/v1/branches/branch-alpha/orders', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer mock-user:fb-op-alpha:operator.alpha@melt.local:Alpha Operator',
          'x-session-token': operatorSessionToken,
        },
      });
      const response = await handleBranchOrdersRoute(request, 'branch-alpha', { DB: db });
      const json = (await response.json()) as any;
      if (response.status !== 200) {
        console.log('DEBUG Operator Alpha error:', response.status, json);
      }
      assert.strictEqual(response.status, 200);
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.length, 1);
      assert.strictEqual(json.data[0].id, 'ord-101');
    });

    it('forbids Operator of Branch Alpha from accessing Branch Beta orders', async () => {
      const request = new Request('http://localhost:3000/api/v1/branches/branch-beta/orders', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer mock-user:fb-op-alpha:operator.alpha@melt.local:Alpha Operator',
          'x-session-token': operatorSessionToken,
        },
      });
      const response = await handleBranchOrdersRoute(request, 'branch-beta', { DB: db });
      assert.strictEqual(response.status, 403, 'Cross-branch access must return 403 Forbidden');
    });

    it('forbids Customer from accessing Branch orders', async () => {
      const request = new Request('http://localhost:3000/api/v1/branches/branch-alpha/orders', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer mock-user:fb-customer-1:customer1@melt.local:Customer 1',
        },
      });
      const response = await handleBranchOrdersRoute(request, 'branch-alpha', { DB: db });
      assert.strictEqual(response.status, 401, 'Customer without session cannot access branch routes');
    });

    it('allows Owner with GLOBAL session to access both Branch Alpha and Branch Beta', async () => {
      const reqAlpha = new Request('http://localhost:3000/api/v1/branches/branch-alpha/orders', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer mock-user:fb-owner:owner@melt.local:Owner Boss',
          'x-session-token': ownerSessionToken,
        },
      });
      const resAlpha = await handleBranchOrdersRoute(reqAlpha, 'branch-alpha', { DB: db });
      const jsonAlpha = (await resAlpha.json()) as any;
      if (resAlpha.status !== 200) {
        console.log('DEBUG Owner Alpha error:', resAlpha.status, jsonAlpha);
      }
      assert.strictEqual(resAlpha.status, 200);

      const reqBeta = new Request('http://localhost:3000/api/v1/branches/branch-beta/orders', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer mock-user:fb-owner:owner@melt.local:Owner Boss',
          'x-session-token': ownerSessionToken,
        },
      });
      const resBeta = await handleBranchOrdersRoute(reqBeta, 'branch-beta', { DB: db });
      assert.strictEqual(resBeta.status, 200);
    });
  });

  describe('Protected Customer Data Authorization Path', () => {
    it('allows Customer to view their own orders without operator PIN session', async () => {
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

  describe('Session Revocation Endpoints', () => {
    beforeEach(setupSessions);
    it('revokes an existing application session by owner or owner-user', async () => {
      const request = new Request('http://localhost:3000/api/v1/auth/revoke-session', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock-user:fb-op-alpha:operator.alpha@melt.local:Alpha Operator',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId: operatorSessionId }),
      });
      const response = await handleRevokeSession(request, { DB: db });
      assert.strictEqual(response.status, 200);

      // Verify the revoked session can no longer be used
      const opReq = new Request('http://localhost:3000/api/v1/branches/branch-alpha/orders', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer mock-user:fb-op-alpha:operator.alpha@melt.local:Alpha Operator',
          'x-session-token': operatorSessionToken,
        },
      });
      const opRes = await handleBranchOrdersRoute(opReq, 'branch-alpha', { DB: db });
      assert.strictEqual(opRes.status, 401, 'Revoked session must be rejected with 401');
    });

    it('forbids a user from revoking another user session', async () => {
      const request = new Request('http://localhost:3000/api/v1/auth/revoke-session', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock-user:fb-customer-1:customer1@melt.local:Customer 1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId: ownerSessionId }),
      });
      const response = await handleRevokeSession(request, { DB: db });
      assert.strictEqual(response.status, 403, 'Revoking another user session must return 403 Forbidden');
    });

    it('returns 404 when revoking non-existent session ID', async () => {
      const request = new Request('http://localhost:3000/api/v1/auth/revoke-session', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock-user:fb-owner:owner@melt.local:Owner Boss',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId: 'sess-non-existent-xyz' }),
      });
      const response = await handleRevokeSession(request, { DB: db });
      assert.strictEqual(response.status, 404, 'Non-existent session must return 404');
    });

    it('revokes all sessions for current user via revoke-all-sessions', async () => {
      const request = new Request('http://localhost:3000/api/v1/auth/revoke-all-sessions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock-user:fb-owner:owner@melt.local:Owner Boss',
        },
      });
      const response = await handleRevokeAllSessions(request, { DB: db });
      assert.strictEqual(response.status, 200);

      // Verify owner session is now rejected
      const ownerReq = new Request('http://localhost:3000/api/v1/branches/branch-alpha/orders', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer mock-user:fb-owner:owner@melt.local:Owner Boss',
          'x-session-token': ownerSessionToken,
        },
      });
      const ownerRes = await handleBranchOrdersRoute(ownerReq, 'branch-alpha', { DB: db });
      assert.strictEqual(ownerRes.status, 401, 'Revoked sessions must be rejected');
    });
  });

  describe('Role and Session Spoofing Defenses', () => {
    beforeEach(setupSessions);
    it('ignores client attempts to spoof role in request body during login', async () => {
      const request = new Request('http://localhost:3000/api/v1/auth/login', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock-user:fb-spoof-new:spoof@melt.local:Spoofer',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role: 'OWNER',
          isOwner: true,
          userId: 'usr-fake-owner',
        }),
      });
      const response = await handleAuthLogin(request, { DB: db });
      assert.strictEqual(response.status, 200);
      const json = (await response.json()) as any;
      assert.strictEqual(json.data.user.role, UserRole.CUSTOMER, 'New user must remain CUSTOMER despite spoofed body');
    });

    it('rejects operator session attempting to access another branch URL', async () => {
      const request = new Request('http://localhost:3000/api/v1/branches/branch-beta/orders?branchId=branch-alpha', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer mock-user:fb-op-alpha:operator.alpha@melt.local:Alpha Operator',
          'x-session-token': operatorSessionToken,
        },
      });
      const response = await handleBranchOrdersRoute(request, 'branch-beta', { DB: db });
      assert.strictEqual(response.status, 403, 'Cross-branch access must return 403 regardless of query params');
    });

    it('rejects request with valid Firebase identity but different user session token', async () => {
      const request = new Request('http://localhost:3000/api/v1/branches/branch-alpha/orders', {
        method: 'GET',
        headers: {
          // Authenticated as Customer 1, but providing Owner session token
          Authorization: 'Bearer mock-user:fb-customer-1:customer1@melt.local:Customer 1',
          'x-session-token': ownerSessionToken,
        },
      });
      const response = await handleBranchOrdersRoute(request, 'branch-alpha', { DB: db });
      assert.strictEqual(response.status, 403, 'Session belonging to different user must be rejected with 403');
    });
  });
});
