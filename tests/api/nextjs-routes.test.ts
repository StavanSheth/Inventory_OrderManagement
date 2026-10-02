(process.env as Record<string, string | undefined>).NODE_ENV = 'test';

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryD1Database } from '../../database/adapter.sqlite';
import { runMigrations } from '../../database/migrations/runner';
import { UserRepository } from '../../database/repositories/user.repository';
import { BranchRepository } from '../../database/repositories/branch.repository';
import { ProductRepository } from '../../database/repositories/product.repository';
import { UserRole, MembershipStatus } from '../../shared/enums/roles.enum';
import { BranchStatus } from '../../shared/enums/branch.enum';
import { PaymentMethod, OrderStatus } from '../../shared/enums/order.enum';
import { handleSetPin, handleVerifyPin } from '../../api/routes/auth.route';
import { D1DatabaseLike, CloudflareEnv } from '../../database/types';

// Import actual Next.js route handlers
import * as CatalogRoute from '../../app/api/v1/branches/[id]/catalog/route';
import * as CustomerOrdersRoute from '../../app/api/v1/customer/orders/route';
import * as CustomerOrderDetailRoute from '../../app/api/v1/customer/orders/[orderId]/route';
import * as BranchOrdersRoute from '../../app/api/v1/branches/[id]/orders/route';
import * as BranchOrderDetailRoute from '../../app/api/v1/branches/[id]/orders/[orderId]/route';
import * as BranchOrderStatusRoute from '../../app/api/v1/branches/[id]/orders/[orderId]/status/route';
import * as RecordPaymentRoute from '../../app/api/v1/branches/[id]/orders/[orderId]/payments/route';
import * as VerifyPaymentRoute from '../../app/api/v1/branches/[id]/orders/[orderId]/payments/[paymentId]/verify/route';
import * as ConfirmOrderRoute from '../../app/api/v1/branches/[id]/orders/[orderId]/confirm/route';
import * as RealtimeEventsRoute from '../../app/api/v1/realtime/events/route';
import * as CronExpireRoute from '../../app/api/v1/cron/expire-orders/route';
import * as OwnerMarketingCustomersRoute from '../../app/api/v1/owner/marketing/customers/route';
import * as OwnerMarketingBroadcastRoute from '../../app/api/v1/owner/marketing/broadcast/route';
import * as OwnerReportsRoute from '../../app/api/v1/owner/reports/route';
import * as CustomerCouponsRoute from '../../app/api/v1/customer/coupons/route';

function bearerToken(uid: string, email: string, name: string): string {
  return `Bearer mock-user:${uid}:${email}:${name}`;
}

describe('Next.js API Routes (app/api/v1) — End-to-End Exposure', () => {
  let db: D1DatabaseLike;
  let operatorSessionToken: string;

  beforeEach(async () => {
    db = createMemoryD1Database();
    (globalThis as unknown as { env?: CloudflareEnv }).env = { DB: db };

    await runMigrations(db);

    const userRepo = new UserRepository(db);
    const branchRepo = new BranchRepository(db);
    const productRepo = new ProductRepository(db);

    // 1. Branches
    await branchRepo.create({ id: 'branch-alpha', name: 'Branch Alpha', code: 'ALPHA', status: BranchStatus.ACTIVE });
    await branchRepo.create({ id: 'branch-beta', name: 'Branch Beta', code: 'BETA', status: BranchStatus.ACTIVE });

    // 2. Users
    await userRepo.create({ id: 'usr-owner', firebase_uid: 'fb-owner', email: 'owner@melt.local', display_name: 'Owner', role: UserRole.OWNER });
    await userRepo.create({ id: 'usr-cust', firebase_uid: 'fb-cust', email: 'cust@melt.local', display_name: 'Customer', role: UserRole.CUSTOMER });
    await userRepo.create({ id: 'usr-op', firebase_uid: 'fb-op', email: 'op@melt.local', display_name: 'Operator', role: UserRole.CUSTOMER });
    await userRepo.addMembership('mem-op', 'usr-op', 'branch-alpha', UserRole.BRANCH_OPERATOR, MembershipStatus.ACTIVE);

    // 3. Products
    await productRepo.createCategory({ id: 'cat-scoops', branch_id: 'branch-alpha', name: 'Scoops', active: true, sort_order: 1 });
    await productRepo.create({ id: 'prod-a1', branch_id: 'branch-alpha', category_id: 'cat-scoops', name: 'Vanilla Bean', price: 100, active: true });
    await productRepo.create({ id: 'prod-a2', branch_id: 'branch-alpha', category_id: 'cat-scoops', name: 'Belgian Choc', price: 150, active: true });

    // 4. Operator PIN session
    await handleSetPin(
      new Request('http://x/', {
        method: 'POST',
        headers: { Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '1234' }),
      }),
      { DB: db },
    );

    const verifyResp = await handleVerifyPin(
      new Request('http://x/', {
        method: 'POST',
        headers: { Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '1234', branchId: 'branch-alpha' }),
      }),
      { DB: db },
    );
    const verifyData = (await verifyResp.json()) as { data: { sessionToken: string } };
    operatorSessionToken = verifyData.data.sessionToken;
  });

  it('exposes GET /branches/:id/catalog', async () => {
    const req = new Request('http://x/api/v1/branches/branch-alpha/catalog');
    const resp = await CatalogRoute.GET(req, { params: Promise.resolve({ id: 'branch-alpha' }) });
    assert.strictEqual(resp.status, 200);
    const json = (await resp.json()) as { success: boolean; data: { catalog: unknown[] } };
    assert.strictEqual(json.success, true);
    assert.ok(json.data.catalog.length > 0);
  });

  it('exposes POST and GET /customer/orders', async () => {
    // 1. Create Order via POST
    const createReq = new Request('http://x/api/v1/customer/orders', {
      method: 'POST',
      headers: {
        Authorization: bearerToken('fb-cust', 'cust@melt.local', 'Customer'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        branchId: 'branch-alpha',
        items: [{ productId: 'prod-a1', quantity: 2 }],
      }),
    });

    const createResp = await CustomerOrdersRoute.POST(createReq);
    assert.strictEqual(createResp.status, 201);
    const createJson = (await createResp.json()) as { data: { order: { id: string; total: number } } };
    const orderId = createJson.data.order.id;
    // 2 x 100 + 5% tax = 210
    assert.strictEqual(createJson.data.order.total, 210);

    // 2. List Orders via GET
    const listReq = new Request('http://x/api/v1/customer/orders', {
      headers: { Authorization: bearerToken('fb-cust', 'cust@melt.local', 'Customer') },
    });
    const listResp = await CustomerOrdersRoute.GET(listReq);
    assert.strictEqual(listResp.status, 200);
    const listJson = (await listResp.json()) as { data: Array<{ id: string }> };
    assert.strictEqual(listJson.data.length, 1);
    assert.strictEqual(listJson.data[0].id, orderId);

    // 3. Get Detail via GET /customer/orders/:orderId
    const detailReq = new Request(`http://x/api/v1/customer/orders/${orderId}`, {
      headers: { Authorization: bearerToken('fb-cust', 'cust@melt.local', 'Customer') },
    });
    const detailResp = await CustomerOrderDetailRoute.GET(detailReq, { params: Promise.resolve({ orderId }) });
    assert.strictEqual(detailResp.status, 200);
    const detailJson = (await detailResp.json()) as { data: { order: { id: string } } };
    assert.strictEqual(detailJson.data.order.id, orderId);
  });

  it('exposes operator lifecycle: queue -> payment -> verify -> confirm -> edit -> status', async () => {
    // 1. Customer creates an order
    const createReq = new Request('http://x/api/v1/customer/orders', {
      method: 'POST',
      headers: { Authorization: bearerToken('fb-cust', 'cust@melt.local', 'Customer'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ branchId: 'branch-alpha', items: [{ productId: 'prod-a1', quantity: 1 }] }),
    });
    const createResp = await CustomerOrdersRoute.POST(createReq);
    const { data: cd } = (await createResp.json()) as { data: { order: { id: string; total: number } } };
    const orderId = cd.order.id;
    assert.strictEqual(cd.order.total, 105);

    // 2. Operator queues orders via GET /branches/:id/orders
    const queueReq = new Request('http://x/api/v1/branches/branch-alpha/orders', {
      headers: {
        Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'),
        'x-session-token': operatorSessionToken,
      },
    });
    const queueResp = await BranchOrdersRoute.GET(queueReq, { params: Promise.resolve({ id: 'branch-alpha' }) });
    assert.strictEqual(queueResp.status, 200);

    // 3. Operator views detail via GET /branches/:id/orders/:orderId
    const detailReq = new Request(`http://x/api/v1/branches/branch-alpha/orders/${orderId}`, {
      headers: {
        Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'),
        'x-session-token': operatorSessionToken,
      },
    });
    const detailResp = await BranchOrderDetailRoute.GET(detailReq, { params: Promise.resolve({ id: 'branch-alpha', orderId }) });
    assert.strictEqual(detailResp.status, 200);

    // 4. Record payment via POST /branches/:id/orders/:orderId/payments
    const payReq = new Request(`http://x/api/v1/branches/branch-alpha/orders/${orderId}/payments`, {
      method: 'POST',
      headers: {
        Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'),
        'x-session-token': operatorSessionToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ method: PaymentMethod.CASH, amount: 105 }),
    });
    const payResp = await RecordPaymentRoute.POST(payReq, { params: Promise.resolve({ id: 'branch-alpha', orderId }) });
    assert.strictEqual(payResp.status, 201);
    const payJson = (await payResp.json()) as { data: { payment: { id: string } } };
    const paymentId = payJson.data.payment.id;

    // 5. Verify payment via POST .../verify
    const verifyReq = new Request(`http://x/api/v1/branches/branch-alpha/orders/${orderId}/payments/${paymentId}/verify`, {
      method: 'POST',
      headers: {
        Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'),
        'x-session-token': operatorSessionToken,
      },
    });
    const verifyResp = await VerifyPaymentRoute.POST(verifyReq, { params: Promise.resolve({ id: 'branch-alpha', orderId, paymentId }) });
    assert.strictEqual(verifyResp.status, 200);

    // 6. Confirm order via POST .../confirm
    const confirmReq = new Request(`http://x/api/v1/branches/branch-alpha/orders/${orderId}/confirm`, {
      method: 'POST',
      headers: {
        Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'),
        'x-session-token': operatorSessionToken,
      },
    });
    const confirmResp = await ConfirmOrderRoute.POST(confirmReq, { params: Promise.resolve({ id: 'branch-alpha', orderId }) });
    assert.strictEqual(confirmResp.status, 200);

    // 7. Operator edits order via PATCH .../orders/:orderId
    const editReq = new Request(`http://x/api/v1/branches/branch-alpha/orders/${orderId}`, {
      method: 'PATCH',
      headers: {
        Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'),
        'x-session-token': operatorSessionToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ items: [{ productId: 'prod-a1', quantity: 2 }] }),
    });
    const editResp = await BranchOrderDetailRoute.PATCH(editReq, { params: Promise.resolve({ id: 'branch-alpha', orderId }) });
    assert.strictEqual(editResp.status, 200);
    const editJson = (await editResp.json()) as { data: { newTotal: number; paymentDifference: number } };
    // 2 x 100 + 5% = 210, already verified = 105 -> difference = +105
    assert.strictEqual(editJson.data.newTotal, 210);
    assert.strictEqual(editJson.data.paymentDifference, 105);

    // 8. Progress status via PATCH .../status
    const statusReq = new Request(`http://x/api/v1/branches/branch-alpha/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'),
        'x-session-token': operatorSessionToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: OrderStatus.PREPARING }),
    });
    const statusResp = await BranchOrderStatusRoute.PATCH(statusReq, { params: Promise.resolve({ id: 'branch-alpha', orderId }) });
    assert.strictEqual(statusResp.status, 200);
  });

  it('exposes realtime events route and cron expiry route', async () => {
    // 1. Cron expiry route
    const cronReq = new Request('http://x/api/v1/cron/expire-orders', { method: 'POST' });
    const cronResp = await CronExpireRoute.POST(cronReq);
    assert.strictEqual(cronResp.status, 200);
    const cronJson = (await cronResp.json()) as { success: boolean; data: { ok: boolean } };
    assert.strictEqual(cronJson.data.ok, true);

    // 2. Realtime SSE route
    const sseReq = new Request('http://x/api/v1/realtime/events', {
      headers: { Authorization: bearerToken('fb-cust', 'cust@melt.local', 'Customer') },
    });
    const sseResp = await RealtimeEventsRoute.GET(sseReq);
    assert.strictEqual(sseResp.status, 200);
    assert.strictEqual(sseResp.headers.get('Content-Type'), 'text/event-stream');
  });

  it('exposes POST /branches/:id/orders for operator direct counter order booking', async () => {
    const bookReq = new Request('http://x/api/v1/branches/branch-alpha/orders', {
      method: 'POST',
      headers: {
        Authorization: bearerToken('fb-op', 'op@melt.local', 'Operator'),
        'x-session-token': operatorSessionToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [{ productId: 'prod-a1', quantity: 1 }],
        initialStatus: 'READY',
        paymentMethod: 'CASH',
        paymentNotes: 'Counter Booking Test',
      }),
    });
    const resp = await BranchOrdersRoute.POST(bookReq, { params: Promise.resolve({ id: 'branch-alpha' }) });
    assert.strictEqual(resp.status, 201);
    const json = (await resp.json()) as { data: { order: { status: string; payment_status: string } } };
    assert.strictEqual(json.data.order.status, 'READY');
    assert.strictEqual(json.data.order.payment_status, 'VERIFIED');
  });

  it('exposes GET and POST /owner/marketing routes for customer segmentation and broadcasts', async () => {
    // 1. GET customers with order stats and categorization
    const custReq = new Request('http://x/api/v1/owner/marketing/customers?range=30d&category=ALL', {
      headers: { Authorization: bearerToken('fb-owner', 'owner@melt.local', 'Owner') },
    });
    const custResp = await OwnerMarketingCustomersRoute.GET(custReq as any);
    assert.strictEqual(custResp.status, 200);
    const custJson = (await custResp.json()) as { data: { customers: unknown[]; summary: { totalCount: number } } };
    assert.ok(Array.isArray(custJson.data.customers));
    assert.ok(custJson.data.summary.totalCount >= 1);

    // 2. POST broadcast campaign
    const broadReq = new Request('http://x/api/v1/owner/marketing/broadcast', {
      method: 'POST',
      headers: {
        Authorization: bearerToken('fb-owner', 'owner@melt.local', 'Owner'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: 'WHATSAPP',
        recipients: [
          {
            userId: 'usr-cust',
            name: 'Customer',
            phone: '919876543210',
            message: 'Hello Customer! Use code PRIVATE25 for 25% off.',
            imageUrl: 'https://example.com/custom-customer-pic.jpg',
          },
        ],
        messageTemplate: 'Hello {{name}}! Use code {{coupon_code}} for {{discount}}.',
        imageUrl: 'https://example.com/banner.jpg',
        promoCoupon: {
          enabled: true,
          code: 'PRIVATE25',
          title: 'Special 25% Off Treat',
          discountType: 'PERCENTAGE',
          discountValue: 25,
          minOrderValue: 150,
          expiryDays: 14,
        },
      }),
    });
    const broadResp = await OwnerMarketingBroadcastRoute.POST(broadReq as any);
    assert.strictEqual(broadResp.status, 201);
    const broadJson = (await broadResp.json()) as {
      data: {
        campaignId: string;
        dispatchedCount: number;
        promoAssigned: { assignedCount: number };
        previews: Array<{ actionUrl: string; imageUrl?: string }>;
      };
    };
    assert.strictEqual(broadJson.data.dispatchedCount, 1);
    assert.ok(broadJson.data.campaignId.startsWith('camp-'));
    assert.strictEqual(broadJson.data.promoAssigned?.assignedCount, 1);
    assert.ok(broadJson.data.previews[0].actionUrl.includes('https://wa.me/919876543210'));
    assert.strictEqual(broadJson.data.previews[0].imageUrl, 'https://example.com/custom-customer-pic.jpg');

    // Verify Customer can query their private coupons via GET /api/v1/customer/coupons
    const coupReq = new Request('http://x/api/v1/customer/coupons?branchId=branch-alpha', {
      headers: { Authorization: bearerToken('fb-cust', 'cust@melt.local', 'Customer') },
    });
    const coupResp = await CustomerCouponsRoute.GET(coupReq as any);
    assert.strictEqual(coupResp.status, 200);
    const coupJson = (await coupResp.json()) as { data: Array<{ coupon_code: string; discount_value: number }> };
    assert.ok(Array.isArray(coupJson.data));
    assert.ok(coupJson.data.some((c) => c.coupon_code === 'PRIVATE25'));
  });

  it('exposes GET /owner/reports for CSV reports export across history, inventory, branches, ledger, and customers', async () => {
    const reportTypes = ['history', 'inventory', 'branches', 'ledger', 'customers'] as const;

    for (const type of reportTypes) {
      const repReq = new Request(`http://x/api/v1/owner/reports?type=${type}&format=csv`, {
        headers: { Authorization: bearerToken('fb-owner', 'owner@melt.local', 'Owner') },
      });
      const repResp = await OwnerReportsRoute.GET(repReq as any);
      assert.strictEqual(repResp.status, 200);
      assert.strictEqual(repResp.headers.get('Content-Type'), 'text/csv; charset=utf-8');
      const csv = await repResp.text();
      assert.ok(csv.length > 0, `CSV content for ${type} should not be empty`);
    }
  });
});
