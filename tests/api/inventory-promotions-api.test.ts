(process.env as Record<string, string | undefined>).NODE_ENV = 'test';

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createMemoryD1Database } from '../../database/adapter.sqlite';
import { runMigrations } from '../../database/migrations/runner';
import { UserRepository } from '../../database/repositories/user.repository';
import { BranchRepository } from '../../database/repositories/branch.repository';
import { UserRole, MembershipStatus } from '../../shared/enums/roles.enum';
import { handleSetPin, handleVerifyPin } from '../../api/routes/auth.route';
import { resetRateLimits } from '../../api/middleware/rate-limiter';
import {
  handleGetInventoryRoute,
  handleRefillInventoryRoute,
  handleAdjustInventoryRoute,
  handleGetMovementsRoute,
  handleProductBOMRoute,
  handleUpdateInventoryPricingRoute,
} from '../../api/routes/inventory.route';
import {
  handleBranchOffersRoute,
  handleBranchCouponsRoute,
  handleValidateCouponRoute,
} from '../../api/routes/promotions.route';
import { D1DatabaseLike } from '../../database/types';

function bearerToken(uid: string, email: string, name: string): string {
  return `Bearer mock-user:${uid}:${email}:${name}`;
}

describe('Phase 4 — Inventory & Promotions API HTTP Endpoints', () => {
  let db: D1DatabaseLike;
  let userRepo: UserRepository;
  let branchRepo: BranchRepository;
  let operatorSessionToken: string;
  let ownerSessionToken: string;

  const branchAlpha = 'branch-alpha';
  const branchBeta = 'branch-beta';
  const productId = 'prod-pistachio';
  const rawMaterialId = 'raw-pistachio-paste';

  beforeEach(async () => {
    resetRateLimits();
    db = createMemoryD1Database();
    const migrationsDir = path.resolve(process.cwd(), 'database', 'migrations');
    await runMigrations(db, migrationsDir);

    userRepo = new UserRepository(db);
    branchRepo = new BranchRepository(db);

    const now = new Date().toISOString();

    // 1. Branches & Settings
    await branchRepo.create({ id: branchAlpha, name: 'Alpha Branch', code: 'ALPHA' });
    await branchRepo.create({ id: branchBeta, name: 'Beta Branch', code: 'BETA' });

    await db
      .prepare(
        `INSERT INTO branch_settings (id, branch_id, session_timeout_value, session_timeout_unit, order_expiry_minutes, order_edit_window_minutes, updated_at)
         VALUES ('bs-alpha', 'branch-alpha', 4, 'HOURS', 15, 60, ?),
                ('bs-beta',  'branch-beta',  4, 'HOURS', 15, 60, ?)`,
      )
      .bind(now, now)
      .run();

    // 2. Categories & Products
    await db
      .prepare(`INSERT INTO categories (id, branch_id, name, active, sort_order, created_at, updated_at) VALUES ('cat-a', 'branch-alpha', 'Scoops', 1, 1, ?, ?)`)
      .bind(now, now)
      .run();
    await db
      .prepare(
        `INSERT INTO products (id, branch_id, category_id, name, description, price, active, created_at, updated_at)
         VALUES (?, 'branch-alpha', 'cat-a', 'Pistachio', 'Rich Pistachio', 150, 1, ?, ?)`,
      )
      .bind(productId, now, now)
      .run();

    // 3. Inventory for Product
    await db
      .prepare(
        `INSERT INTO inventory (id, branch_id, product_id, quantity, reorder_threshold, updated_at)
         VALUES ('inv-a1', 'branch-alpha', ?, 15, 5, ?)`,
      )
      .bind(productId, now)
      .run();

    // 4. Raw Material
    await db
      .prepare(
        `INSERT INTO raw_materials (id, branch_id, name, unit, current_quantity, reorder_threshold, active, created_at, updated_at)
         VALUES (?, 'branch-alpha', 'Pistachio Paste', 'g', 1000, 200, 1, ?, ?)`,
      )
      .bind(rawMaterialId, now, now)
      .run();

    // 5. Users
    // Operator with active membership in branch-alpha
    await userRepo.create({ id: 'usr-op', firebase_uid: 'fb-op', email: 'op@melt.local', display_name: 'Operator', role: UserRole.CUSTOMER });
    await userRepo.addMembership('mem-op', 'usr-op', branchAlpha, UserRole.BRANCH_OPERATOR, MembershipStatus.ACTIVE);

    // Owner (Global)
    await userRepo.create({ id: 'usr-owner', firebase_uid: 'fb-owner', email: 'owner@melt.local', display_name: 'Owner', role: UserRole.OWNER });

    // Customer
    await userRepo.create({ id: 'usr-cust', firebase_uid: 'fb-cust', email: 'cust@melt.local', display_name: 'Customer', role: UserRole.CUSTOMER });

    // 6. Set PINs & authenticate sessions
    await handleSetPin(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '1234' }),
      }),
      { DB: db },
    );
    const opVerify = await handleVerifyPin(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '1234', branchId: branchAlpha }),
      }),
      { DB: db },
    );
    const opJson = (await opVerify.json()) as { data: { sessionToken: string } };
    operatorSessionToken = opJson.data.sessionToken;

    await handleSetPin(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { Authorization: bearerToken('fb-owner', 'owner@melt.local', 'Owner'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '9999' }),
      }),
      { DB: db },
    );
    const ownerVerify = await handleVerifyPin(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { Authorization: bearerToken('fb-owner', 'owner@melt.local', 'Owner'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '9999', scope: 'GLOBAL' }),
      }),
      { DB: db },
    );
    const ownerJson = (await ownerVerify.json()) as { data: { sessionToken: string } };
    ownerSessionToken = ownerJson.data.sessionToken;
  });

  describe('RBAC & Branch Isolation Enforcement', () => {
    it('rejects request without session token with 401 Unauthorized', async () => {
      const resp = await handleRefillInventoryRoute(
        new Request(`http://x/api/v1/branches/${branchAlpha}/inventory/refill`, {
          method: 'POST',
          headers: {
            Authorization: bearerToken('fb-cust', 'cust@melt.local', 'Customer'),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ productId, quantity: 10 }),
        }),
        branchAlpha,
        { DB: db },
      );

      assert.strictEqual(resp.status, 401);
    });

    it('rejects operator from branch-alpha attempting to refill branch-beta inventory with 403 Forbidden', async () => {
      const resp = await handleRefillInventoryRoute(
        new Request(`http://x/api/v1/branches/${branchBeta}/inventory/refill`, {
          method: 'POST',
          headers: {
            Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'),
            'x-session-token': operatorSessionToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ productId, quantity: 10 }),
        }),
        branchBeta,
        { DB: db },
      );

      assert.strictEqual(resp.status, 403);
    });

    it('rejects operator from branch-alpha attempting to create coupons on branch-beta with 403 Forbidden', async () => {
      const resp = await handleBranchCouponsRoute(
        new Request(`http://x/api/v1/branches/${branchBeta}/promotions/coupons`, {
          method: 'POST',
          headers: {
            Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'),
            'x-session-token': operatorSessionToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code: 'BETASAVE',
            name: 'Cross Branch Save',
            discount_type: 'PERCENTAGE',
            discount_value: 20,
            start_at: new Date().toISOString(),
            end_at: new Date(Date.now() + 86400000).toISOString(),
          }),
        }),
        branchBeta,
        { DB: db },
      );

      assert.strictEqual(resp.status, 403);
    });
  });

  describe('Operator Inventory Operations', () => {
    it('allows operator to fetch branch inventory lists and alerts', async () => {
      const resp = await handleGetInventoryRoute(
        new Request(`http://x/api/v1/branches/${branchAlpha}/inventory`, {
          headers: {
            Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'),
            'x-session-token': operatorSessionToken,
          },
        }),
        branchAlpha,
        { DB: db },
      );

      assert.strictEqual(resp.status, 200);
      const json = (await resp.json()) as { success: boolean; data: { products: any[]; rawMaterials: any[] } };
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.products.length, 1);
      assert.strictEqual(json.data.products[0].quantity, 15);
      assert.strictEqual(json.data.rawMaterials.length, 1);
    });

    it('allows operator to refill stock and records movement', async () => {
      const resp = await handleRefillInventoryRoute(
        new Request(`http://x/api/v1/branches/${branchAlpha}/inventory/refill`, {
          method: 'POST',
          headers: {
            Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'),
            'x-session-token': operatorSessionToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            productId,
            quantity: 25,
            reason: 'Morning delivery batch',
          }),
        }),
        branchAlpha,
        { DB: db },
      );

      assert.strictEqual(resp.status, 200);
      const json = (await resp.json()) as { success: boolean; data: { quantity: number } };
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.quantity, 40); // 15 + 25 = 40
    });

    it('allows operator to adjust stock with mandatory reason, and rejects adjustment without reason with 400', async () => {
      // Rejects missing reason
      const failResp = await handleAdjustInventoryRoute(
        new Request(`http://x/api/v1/branches/${branchAlpha}/inventory/adjust`, {
          method: 'POST',
          headers: {
            Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'),
            'x-session-token': operatorSessionToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            productId,
            delta: -2,
            reason: '', // Empty reason
          }),
        }),
        branchAlpha,
        { DB: db },
      );

      assert.strictEqual(failResp.status, 400);

      // Succeeds with valid reason
      const okResp = await handleAdjustInventoryRoute(
        new Request(`http://x/api/v1/branches/${branchAlpha}/inventory/adjust`, {
          method: 'POST',
          headers: {
            Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'),
            'x-session-token': operatorSessionToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            productId,
            delta: -3,
            reason: 'Damaged during freezer defrosting',
          }),
        }),
        branchAlpha,
        { DB: db },
      );

      assert.strictEqual(okResp.status, 200);
      const json = (await okResp.json()) as { success: boolean; data: { quantity: number } };
      assert.strictEqual(json.data.quantity, 12); // 15 - 3 = 12
    });

    it('allows operator to fetch movements ledger', async () => {
      const resp = await handleGetMovementsRoute(
        new Request(`http://x/api/v1/branches/${branchAlpha}/inventory/movements`, {
          headers: {
            Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'),
            'x-session-token': operatorSessionToken,
          },
        }),
        branchAlpha,
        { DB: db },
      );

      assert.strictEqual(resp.status, 200);
      const json = (await resp.json()) as { success: boolean; data: any[] };
      assert.strictEqual(json.success, true);
      assert.ok(Array.isArray(json.data));
    });

    it('allows operator to configure recipe BOM components for a product', async () => {
      const resp = await handleProductBOMRoute(
        new Request(`http://x/api/v1/branches/${branchAlpha}/inventory/bom/${productId}`, {
          method: 'PUT',
          headers: {
            Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'),
            'x-session-token': operatorSessionToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            components: [{ rawMaterialId, quantityRequired: 75 }],
          }),
        }),
        branchAlpha,
        productId,
        { DB: db },
      );

      assert.strictEqual(resp.status, 200);
      const json = (await resp.json()) as { success: boolean; data: any[] };
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.length, 1);
      assert.strictEqual(json.data[0].quantity_required, 75);
    });

    it('allows operator to update product selling price, tax rate, and sub-tax rates', async () => {
      const resp = await handleUpdateInventoryPricingRoute(
        new Request(`http://x/api/v1/branches/${branchAlpha}/inventory/pricing`, {
          method: 'PATCH',
          headers: {
            Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'),
            'x-session-token': operatorSessionToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            productId,
            selling_price: 220,
            tax_rate: 18,
            cgst_rate: 9,
            sgst_rate: 9,
            igst_rate: 0,
          }),
        }),
        branchAlpha,
        { DB: db },
      );

      assert.strictEqual(resp.status, 200);
      const json = (await resp.json()) as { success: boolean; data: { inventory: any } };
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.inventory.selling_price, 220);
      assert.strictEqual(json.data.inventory.tax_rate, 18);
      assert.strictEqual(json.data.inventory.cgst_rate, 9);
      assert.strictEqual(json.data.inventory.sgst_rate, 9);
      assert.strictEqual(json.data.inventory.igst_rate, 0);

      // Verify get inventory reflects the updated selling price and sub-taxes
      const getResp = await handleGetInventoryRoute(
        new Request(`http://x/api/v1/branches/${branchAlpha}/inventory`, {
          headers: {
            Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'),
            'x-session-token': operatorSessionToken,
          },
        }),
        branchAlpha,
        { DB: db },
      );
      assert.strictEqual(getResp.status, 200);
      const getJson = (await getResp.json()) as { success: boolean; data: { products: any[] } };
      assert.strictEqual(getJson.data.products[0].selling_price, 220);
      assert.strictEqual(getJson.data.products[0].tax_rate, 18);
      assert.strictEqual(getJson.data.products[0].cgst_rate, 9);
      assert.strictEqual(getJson.data.products[0].sgst_rate, 9);
    });
  });

  describe('Promotions & Coupons Management and Validation', () => {
    it('allows operator to create coupon and public/customer to validate coupon', async () => {
      // 1. Operator creates coupon
      const createResp = await handleBranchCouponsRoute(
        new Request(`http://x/api/v1/branches/${branchAlpha}/promotions/coupons`, {
          method: 'POST',
          headers: {
            Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'),
            'x-session-token': operatorSessionToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code: 'FLAVOR25',
            name: '25% Off Flavor Week',
            discount_type: 'PERCENTAGE',
            discount_value: 25,
            max_discount: 100,
            minimum_order_value: 200,
            start_at: new Date(Date.now() - 3600000).toISOString(),
            end_at: new Date(Date.now() + 86400000).toISOString(),
            active: true,
          }),
        }),
        branchAlpha,
        { DB: db },
      );

      assert.strictEqual(createResp.status, 201);
      const createJson = (await createResp.json()) as { success: boolean; data: { id: string; code: string } };
      assert.strictEqual(createJson.data.code, 'FLAVOR25');

      // 2. Customer validates coupon with subtotal = 400
      // 25% of 400 = 100 <= max_discount 100
      const valResp = await handleValidateCouponRoute(
        new Request(`http://x/api/v1/branches/${branchAlpha}/promotions/validate`, {
          method: 'POST',
          headers: {
            Authorization: bearerToken('fb-cust', 'cust@melt.local', 'Customer'),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code: 'FLAVOR25',
            subtotal: 400,
          }),
        }),
        branchAlpha,
        { DB: db },
      );

      assert.strictEqual(valResp.status, 200);
      const valJson = (await valResp.json()) as { success: boolean; data: { isValid: boolean; discount: number } };
      assert.strictEqual(valJson.success, true);
      assert.strictEqual(valJson.data.isValid, true);
      assert.strictEqual(valJson.data.discount, 100);

      // 3. Customer validates coupon with subtotal = 100 (below minimum_order_value 200)
      const valFailResp = await handleValidateCouponRoute(
        new Request(`http://x/api/v1/branches/${branchAlpha}/promotions/validate`, {
          method: 'POST',
          headers: {
            Authorization: bearerToken('fb-cust', 'cust@melt.local', 'Customer'),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code: 'FLAVOR25',
            subtotal: 100,
          }),
        }),
        branchAlpha,
        { DB: db },
      );

      assert.strictEqual(valFailResp.status, 200);
      const valFailJson = (await valFailResp.json()) as { success: boolean; data: { isValid: boolean; reason: string } };
      assert.strictEqual(valFailJson.data.isValid, false);
      assert.match(valFailJson.data.reason, /minimum order/i);
    });

    it('allows owner with global session to list branch offers', async () => {
      const resp = await handleBranchOffersRoute(
        new Request(`http://x/api/v1/branches/${branchAlpha}/promotions/offers`, {
          headers: {
            Authorization: bearerToken('fb-owner', 'owner@melt.local', 'Owner'),
            'x-session-token': ownerSessionToken,
          },
        }),
        branchAlpha,
        { DB: db },
      );

      assert.strictEqual(resp.status, 200);
      const json = (await resp.json()) as { success: boolean; data: any[] };
      assert.strictEqual(json.success, true);
      assert.ok(Array.isArray(json.data));
    });
  });
});
