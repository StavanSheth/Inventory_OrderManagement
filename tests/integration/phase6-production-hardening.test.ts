import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../config/runtime';
import { TestFirebaseVerifier } from '../../backend/services/auth/test-firebase-verifier';
import { createAuthInfrastructure } from '../../api/factories/auth.factory';
import { handleApiError } from '../../api/middleware/error-handler';
import { AppError } from '../../backend/errors/app-error';
import { handleOrderExpiryRoute } from '../../api/routes/cron.route';
import { createMemoryD1Database } from '../../database/adapter.sqlite';
import { runMigrations } from '../../database/migrations/runner';
import { OrderRepository } from '../../database/repositories/order.repository';
import { OrderExpiryJob } from '../../backend/jobs/order-expiry.job';
import { AuditRepository } from '../../database/repositories/audit.repository';
import { checkRateLimit, resetRateLimits } from '../../api/middleware/rate-limiter';
import { OrderStatus, PaymentStatus } from '../../shared/enums/order.enum';
import nextConfig from '../../next.config';
import path from 'node:path';

describe('Phase 6 — Production Hardening & Operational Reliability', () => {
  describe('Production Configuration Enforcement', () => {
    it('fails fast if staging environment uses localhost API_BASE_URL', () => {
      assert.throws(() => {
        loadConfig({
          NODE_ENV: 'staging',
          API_BASE_URL: 'http://localhost:3000',
          ALLOWED_ORIGINS: 'https://staging.icecream-melt.com',
          FIREBASE_PROJECT_ID: 'melt-staging',
        });
      }, (err: Error) => err.message.includes('Production/staging cannot use localhost apiBaseUrl'));
    });

    it('fails fast if production allowedOrigins includes localhost', () => {
      assert.throws(() => {
        loadConfig({
          NODE_ENV: 'production',
          API_BASE_URL: 'https://icecream-melt.com',
          ALLOWED_ORIGINS: 'https://icecream-melt.com,http://localhost:3000',
          FIREBASE_PROJECT_ID: 'melt-prod',
        });
      }, (err: Error) => err.message.includes('Production/staging allowedOrigins cannot contain localhost'));
    });

    it('fails fast if staging environment has empty allowedOrigins', () => {
      assert.throws(() => {
        loadConfig({
          NODE_ENV: 'staging',
          API_BASE_URL: 'https://staging.icecream-melt.com',
          ALLOWED_ORIGINS: '',
          FIREBASE_PROJECT_ID: 'melt-staging',
        });
      }, (err: Error) => err.message.includes('must define at least one allowed origin'));
    });
  });

  describe('Auth Verifier Hardening', () => {
    it('strictly forbids TestFirebaseVerifier instantiation in staging mode', () => {
      const orig = process.env.NODE_ENV;
      try {
        (process.env as Record<string, string | undefined>).NODE_ENV = 'staging';
        assert.throws(() => {
          new TestFirebaseVerifier();
        }, (err: Error) => err.message.includes('cannot be used in production environment'));
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = orig;
      }
    });

    it('createAuthInfrastructure rejects custom TestFirebaseVerifier in production mode', () => {
      const orig = process.env.NODE_ENV;
      try {
        (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
        const db = createMemoryD1Database();

        // Create an instance by spoofing constructor before switching to production
        (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
        const testVerifier = new TestFirebaseVerifier();
        (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

        assert.throws(() => {
          createAuthInfrastructure(db, { customVerifier: testVerifier });
        }, (err: Error) => err.message.includes('cannot be used in production or staging environments'));
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = orig;
      }
    });
  });

  describe('Error Sanitization in Production', () => {
    it('sanitizes 500 internal server error messages in production mode', async () => {
      const orig = process.env.NODE_ENV;
      try {
        (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

        // Unhandled raw error with sensitive database syntax
        const rawError = new Error('SQLite error: SELECT * FROM users table corrupted at 0xdeadbeef');
        const res1 = handleApiError(rawError);
        const data1 = await res1.json() as { error: { message: string } };

        assert.strictEqual(res1.status, 500);
        assert.strictEqual(data1.error.message, 'An internal server error occurred');
        assert.strictEqual(JSON.stringify(data1).includes('corrupted'), false);

        // AppError with 500 status code
        const appError = new AppError('Internal connection failure to D1 instance', undefined, 500);
        const res2 = handleApiError(appError);
        const data2 = await res2.json() as { error: { message: string } };

        assert.strictEqual(res2.status, 500);
        assert.strictEqual(data2.error.message, 'An internal server error occurred');
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = orig;
      }
    });

    it('preserves client-facing 400/404 messages in production mode', async () => {
      const orig = process.env.NODE_ENV;
      try {
        (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
        const clientError = new AppError('Order #1002 has expired', undefined, 400);
        const res = handleApiError(clientError);
        const data = await res.json() as { error: { message: string } };

        assert.strictEqual(res.status, 400);
        assert.strictEqual(data.error.message, 'Order #1002 has expired');
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = orig;
      }
    });
  });

  describe('Cron Route Security & Idempotency', () => {
    it('enforces CRON_SECRET authentication on order expiry endpoint', async () => {
      const db = createMemoryD1Database();
      await runMigrations(db, path.resolve(process.cwd(), 'database', 'migrations'));
      const env = { DB: db, CRON_SECRET: 'super-secret-cron-token-999' };

      // Request without auth header
      const reqNoAuth = new Request('http://localhost:3000/api/v1/cron/orders/expire', {
        method: 'POST',
      });
      const res1 = await handleOrderExpiryRoute(env, reqNoAuth);
      assert.strictEqual(res1.status, 401);

      // Request with wrong token
      const reqWrongAuth = new Request('http://localhost:3000/api/v1/cron/orders/expire', {
        method: 'POST',
        headers: { authorization: 'Bearer wrong-token' },
      });
      const res2 = await handleOrderExpiryRoute(env, reqWrongAuth);
      assert.strictEqual(res2.status, 401);

      // Request with correct Bearer token
      const reqCorrectAuth = new Request('http://localhost:3000/api/v1/cron/orders/expire', {
        method: 'POST',
        headers: { authorization: 'Bearer super-secret-cron-token-999' },
      });
      const res3 = await handleOrderExpiryRoute(env, reqCorrectAuth);
      assert.strictEqual(res3.status, 200);

      // Request with correct x-cron-secret header
      const reqHeaderAuth = new Request('http://localhost:3000/api/v1/cron/orders/expire', {
        method: 'POST',
        headers: { 'x-cron-secret': 'super-secret-cron-token-999' },
      });
      const res4 = await handleOrderExpiryRoute(env, reqHeaderAuth);
      assert.strictEqual(res4.status, 200);
    });

    it('order expiry job is strictly idempotent under repeated runs', async () => {
      const db = createMemoryD1Database();
      await runMigrations(db, path.resolve(process.cwd(), 'database', 'migrations'));
      const nowIso = new Date().toISOString();

      // Seed branch, user, product with all required non-null fields
      await db.exec(`
        INSERT INTO branches (id, name, code, status, address, phone, timezone, created_at, updated_at)
        VALUES ('b_p6', 'Hardening Branch', 'HP6', 'ACTIVE', 'Pune', '9876543210', 'Asia/Kolkata', '${nowIso}', '${nowIso}');
        INSERT INTO users (id, firebase_uid, email, display_name, phone, role, status, created_at, updated_at)
        VALUES ('u_p6', 'fb_p6', 'cust_p6@melt.local', 'Test Customer', '9876543210', 'CUSTOMER', 'ACTIVE', '${nowIso}', '${nowIso}');
      `);

      const orderRepo = new OrderRepository(db);
      const auditRepo = new AuditRepository(db);

      // Create an already-expired order
      const pastExpiry = new Date(Date.now() - 60_000).toISOString();
      const order = await orderRepo.create({
        id: 'ord_p6_001',
        order_number: 'ORD-P6-001',
        customer_user_id: 'u_p6',
        branch_id: 'b_p6',
        subtotal: 50000,
        tax: 2500,
        discount: 0,
        total: 52500,
        status: OrderStatus.PENDING,
        payment_status: PaymentStatus.PENDING,
        expires_at: pastExpiry,
        items: [],
      });

      const job = new OrderExpiryJob(orderRepo, undefined, auditRepo);

      // Run 1: Should expire the order
      const run1 = await job.processExpiredOrders();
      assert.strictEqual(run1.expiredCount, 1);

      const updated = await orderRepo.findById(order.id);
      assert.strictEqual(updated?.status, 'EXPIRED');

      // Run 2: Immediately rerun on the same database state
      const run2 = await job.processExpiredOrders();
      assert.strictEqual(run2.expiredCount, 0);

      // Verify audit trail recorded exactly 1 ORDER_EXPIRED event
      const auditRows = await db
        .prepare("SELECT * FROM audit_logs WHERE entity_id = ? AND action = 'ORDER_EXPIRED'")
        .bind(order.id)
        .all();
      assert.strictEqual(auditRows.results.length, 1);
    });
  });

  describe('Rate Limiting & Security Headers', () => {
    it('rate limiter enforces request limits and provides retry window', () => {
      resetRateLimits();
      const mockReq = new Request('http://localhost:3000/api/v1/test', {
        headers: { 'cf-connecting-ip': '203.0.113.195' },
      });

      const opts = { windowMs: 10_000, maxRequests: 2, keyPrefix: 'test-limit' };

      // Request 1: OK
      assert.doesNotThrow(() => checkRateLimit(mockReq, opts));
      // Request 2: OK
      assert.doesNotThrow(() => checkRateLimit(mockReq, opts));
      // Request 3: Exceeded -> Throws TooManyRequestsError
      assert.throws(() => {
        checkRateLimit(mockReq, opts);
      }, (err: Error) => err.message.includes('Too many requests'));
      resetRateLimits();
    });

    it('next.config.ts configures production HTTP security headers', async () => {
      assert.ok(typeof nextConfig.headers === 'function');
      const headersConfig = await nextConfig.headers();
      assert.ok(Array.isArray(headersConfig));
      assert.ok(headersConfig.length > 0);

      const rootHeaderRule = headersConfig.find((r) => r.source === '/(.*)');
      assert.ok(rootHeaderRule);

      const headerMap = new Map(rootHeaderRule.headers.map((h) => [h.key, h.value]));
      assert.strictEqual(headerMap.get('X-Content-Type-Options'), 'nosniff');
      assert.strictEqual(headerMap.get('X-Frame-Options'), 'DENY');
      assert.strictEqual(headerMap.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
      assert.ok(headerMap.get('Permissions-Policy'));
    });
  });
});
