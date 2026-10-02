(process.env as Record<string, string | undefined>).NODE_ENV = 'test';

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryD1Database } from '../../database/adapter.sqlite';
import { runMigrations } from '../../database/migrations/runner';
import { runDevSeed } from '../../database/seeds/dev-seed';
import { handleRealtimeEventsRoute } from '../../api/routes/realtime.route';
import { handleSetPin, handleVerifyPin } from '../../api/routes/auth.route';
import { OrderRepository } from '../../database/repositories/order.repository';
import { UserRepository } from '../../database/repositories/user.repository';
import { realtimeService } from '../../backend/services/realtime';
import { D1DatabaseLike } from '../../database/types';
import { OrderStatus, PaymentStatus } from '../../shared/enums/order.enum';
import { UserRole, MembershipStatus } from '../../shared/enums/roles.enum';
import { resetRateLimits } from '../../api/middleware/rate-limiter';

const CUSTOMER_ID = 'usr-cust-rt';
const OTHER_CUSTOMER_ID = 'usr-other-rt';
const BRANCH_ALPHA = 'branch-alpha';
const BRANCH_BETA = 'branch-beta';

function bearerToken(uid: string, email: string, name: string): string {
  return `Bearer mock-user:${uid}:${email}:${name}`;
}

describe('Realtime SSE API — Authorization & Streaming', () => {
  let db: D1DatabaseLike;
  let orderRepo: OrderRepository;
  let operatorSessionToken: string;
  let ownerSessionToken: string;

  beforeEach(async () => {
    resetRateLimits();
    db = createMemoryD1Database();
    await runMigrations(db);
    await runDevSeed(db);
    orderRepo = new OrderRepository(db);
    const userRepo = new UserRepository(db);

    // 1. Operator
    await userRepo.create({
      id: 'usr-op-rt',
      firebase_uid: 'fb-op-rt',
      email: 'op@melt.local',
      display_name: 'Operator',
      role: UserRole.CUSTOMER,
    });
    await userRepo.addMembership('mem-op-rt', 'usr-op-rt', BRANCH_ALPHA, UserRole.BRANCH_OPERATOR, MembershipStatus.ACTIVE);

    // 2. Owner
    await userRepo.create({
      id: 'usr-owner-rt',
      firebase_uid: 'fb-owner-rt',
      email: 'owner@melt.local',
      display_name: 'Owner',
      role: UserRole.OWNER,
    });

    // 3. Customers
    await userRepo.create({
      id: CUSTOMER_ID,
      firebase_uid: 'fb-cust-rt',
      email: 'cust@melt.local',
      display_name: 'Customer',
      role: UserRole.CUSTOMER,
    });
    await userRepo.create({
      id: OTHER_CUSTOMER_ID,
      firebase_uid: 'fb-other-rt',
      email: 'other@melt.local',
      display_name: 'Other Customer',
      role: UserRole.CUSTOMER,
    });

    // Setup Operator PIN & Session
    await handleSetPin(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { Authorization: bearerToken('fb-op-rt', 'op@melt.local', 'Operator'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '1234' }),
      }),
      { DB: db },
    );
    const opVerify = await handleVerifyPin(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { Authorization: bearerToken('fb-op-rt', 'op@melt.local', 'Operator'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '1234', branchId: BRANCH_ALPHA }),
      }),
      { DB: db },
    );
    const opJson = (await opVerify.json()) as { data: { sessionToken: string } };
    operatorSessionToken = opJson.data.sessionToken;

    // Setup Owner PIN & Session
    await handleSetPin(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { Authorization: bearerToken('fb-owner-rt', 'owner@melt.local', 'Owner'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '9999' }),
      }),
      { DB: db },
    );
    const ownerVerify = await handleVerifyPin(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { Authorization: bearerToken('fb-owner-rt', 'owner@melt.local', 'Owner'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '9999', scope: 'GLOBAL' }),
      }),
      { DB: db },
    );
    const ownerJson = (await ownerVerify.json()) as { data: { sessionToken: string } };
    ownerSessionToken = ownerJson.data.sessionToken;
  });

  it('rejects unauthenticated SSE request with 401', async () => {
    const res = await handleRealtimeEventsRoute(
      new Request('http://localhost/api/v1/realtime/events?orderId=ord-1'),
      { DB: db },
    );
    assert.strictEqual(res.status, 401);
  });

  it('allows customer to subscribe to their own order', async () => {
    const order = await orderRepo.create({
      id: 'ord-cust-1',
      order_number: 'ALPHA-20261002-0001',
      branch_id: BRANCH_ALPHA,
      customer_user_id: CUSTOMER_ID,
      status: OrderStatus.PENDING,
      subtotal: 100,
      total: 105,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      items: [],
    });

    const res = await handleRealtimeEventsRoute(
      new Request(`http://localhost/api/v1/realtime/events?orderId=${order.id}`, {
        headers: { Authorization: bearerToken('fb-cust-rt', 'cust@melt.local', 'Customer') },
      }),
      { DB: db },
    );

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'text/event-stream');
    assert.ok(res.body);
  });

  it('forbids customer from subscribing to another customer order — 403', async () => {
    const otherOrder = await orderRepo.create({
      id: 'ord-other-1',
      order_number: 'ALPHA-20261002-0002',
      branch_id: BRANCH_ALPHA,
      customer_user_id: OTHER_CUSTOMER_ID,
      status: OrderStatus.PENDING,
      subtotal: 100,
      total: 105,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      items: [],
    });

    const res = await handleRealtimeEventsRoute(
      new Request(`http://localhost/api/v1/realtime/events?orderId=${otherOrder.id}`, {
        headers: { Authorization: bearerToken('fb-cust-rt', 'cust@melt.local', 'Customer') },
      }),
      { DB: db },
    );

    assert.strictEqual(res.status, 403);
  });

  it('forbids customer from subscribing to entire branch stream — 403', async () => {
    const res = await handleRealtimeEventsRoute(
      new Request(`http://localhost/api/v1/realtime/events?branchId=${BRANCH_ALPHA}`, {
        headers: { Authorization: bearerToken('fb-cust-rt', 'cust@melt.local', 'Customer') },
      }),
      { DB: db },
    );

    assert.strictEqual(res.status, 403);
  });

  it('allows Operator with valid session to subscribe to assigned branch stream', async () => {
    const res = await handleRealtimeEventsRoute(
      new Request(`http://localhost/api/v1/realtime/events?branchId=${BRANCH_ALPHA}`, {
        headers: {
          Authorization: bearerToken('fb-op-rt', 'op@melt.local', 'Operator'),
          'x-session-token': operatorSessionToken,
        },
      }),
      { DB: db },
    );

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'text/event-stream');
  });

  it('forbids Operator from subscribing to another branch stream — 403', async () => {
    const res = await handleRealtimeEventsRoute(
      new Request(`http://localhost/api/v1/realtime/events?branchId=${BRANCH_BETA}`, {
        headers: {
          Authorization: bearerToken('fb-op-rt', 'op@melt.local', 'Operator'),
          'x-session-token': operatorSessionToken,
        },
      }),
      { DB: db },
    );

    assert.strictEqual(res.status, 403);
  });

  it('allows Owner with global session to subscribe to any branch stream', async () => {
    const res = await handleRealtimeEventsRoute(
      new Request(`http://localhost/api/v1/realtime/events?branchId=${BRANCH_BETA}`, {
        headers: {
          Authorization: bearerToken('fb-owner-rt', 'owner@melt.local', 'Owner'),
          'x-session-token': ownerSessionToken,
        },
      }),
      { DB: db },
    );

    assert.strictEqual(res.status, 200);
  });

  it('delivers events to active subscriber and supports unsubscribe', async () => {
    let receivedEvent = false;
    const unsub = realtimeService.subscribe({ branchId: BRANCH_ALPHA }, (e) => {
      if (e.type === 'OrderStatusChanged') {
        receivedEvent = true;
      }
    });

    await realtimeService.publish({
      type: 'OrderStatusChanged',
      payload: {
        orderId: 'ord-test-sse',
        orderNumber: 'ALPHA-20261002-0099',
        branchId: BRANCH_ALPHA,
        customerUserId: CUSTOMER_ID,
        status: OrderStatus.CONFIRMED,
        paymentStatus: PaymentStatus.VERIFIED,
        total: 100,
        timestamp: new Date().toISOString(),
      },
    });

    assert.strictEqual(receivedEvent, true);

    // Unsubscribe
    unsub();
    receivedEvent = false;
    await realtimeService.publish({
      type: 'OrderStatusChanged',
      payload: {
        orderId: 'ord-test-sse-2',
        orderNumber: 'ALPHA-20261002-0100',
        branchId: BRANCH_ALPHA,
        customerUserId: CUSTOMER_ID,
        status: OrderStatus.COMPLETED,
        paymentStatus: PaymentStatus.VERIFIED,
        total: 100,
        timestamp: new Date().toISOString(),
      },
    });

    assert.strictEqual(receivedEvent, false);
  });

  it('emits stable event IDs and replays missed events via Last-Event-ID / lastEventId', async () => {
    const order = await orderRepo.create({
      id: 'ord-sse-replay',
      order_number: 'ALPHA-20261002-7777',
      branch_id: BRANCH_ALPHA,
      customer_user_id: CUSTOMER_ID,
      subtotal: 100,
      total: 105,
      expires_at: new Date(Date.now() + 900_000).toISOString(),
      items: [{
        id: 'item-sse-1',
        product_id: 'prod-alpha-pistachio',
        product_name_snapshot: 'Roasted Pistachio Scoop',
        unit_price_snapshot: 100,
        quantity: 1,
        line_total: 100,
      }],
    });

    const { DatabaseRealtimeService } = await import('../../backend/services/realtime/database-realtime.service');
    const dbRealtime = new DatabaseRealtimeService(db);

    await dbRealtime.publish({
      id: 'evt-rep-1',
      type: 'OrderStatusChanged',
      payload: {
        orderId: order.id,
        orderNumber: order.order_number,
        branchId: BRANCH_ALPHA,
        customerUserId: CUSTOMER_ID,
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.RECORDED,
        total: 105,
        timestamp: new Date(Date.now() - 2000).toISOString(),
      },
    });

    await dbRealtime.publish({
      id: 'evt-rep-2',
      type: 'OrderStatusChanged',
      payload: {
        orderId: order.id,
        orderNumber: order.order_number,
        branchId: BRANCH_ALPHA,
        customerUserId: CUSTOMER_ID,
        status: OrderStatus.CONFIRMED,
        paymentStatus: PaymentStatus.VERIFIED,
        total: 105,
        timestamp: new Date().toISOString(),
      },
    });

    const req = new Request(`http://localhost/api/v1/realtime/events?orderId=${order.id}&lastEventId=evt-rep-1`, {
      headers: {
        Authorization: bearerToken('fb-cust-rt', 'cust@melt.local', 'Customer'),
      },
    });
    const res = await handleRealtimeEventsRoute(req, { DB: db });
    assert.strictEqual(res.status, 200);

    const reader = res.body?.getReader();
    assert.ok(reader);
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    await reader.cancel();

    assert.ok(text.includes(': connected'), 'Must include connected comment');
    assert.ok(text.includes('id: evt-rep-2'), 'Must replay missed event evt-rep-2 with stable ID');
    assert.ok(!text.includes('id: evt-rep-1'), 'Must not replay already-acknowledged event evt-rep-1');
  });
});
