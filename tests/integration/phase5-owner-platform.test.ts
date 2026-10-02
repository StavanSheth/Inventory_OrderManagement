import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createMemoryD1Database } from '../../database/adapter.sqlite';
import { runMigrations } from '../../database/migrations/runner';
import { UserRepository } from '../../database/repositories/user.repository';
import { SessionRepository } from '../../database/repositories/session.repository';
import { BranchRepository } from '../../database/repositories/branch.repository';
import { OrderRepository } from '../../database/repositories/order.repository';
import { PaymentRepository } from '../../database/repositories/payment.repository';
import { ProductRepository } from '../../database/repositories/product.repository';
import { InventoryRepository } from '../../database/repositories/inventory.repository';
import { AuditRepository } from '../../database/repositories/audit.repository';

import { DashboardService } from '../../backend/services/dashboard';
import { OrdersService } from '../../backend/services/orders';
import { BranchesService } from '../../backend/services/branches';
import { DeletionService } from '../../backend/services/deletion';
import { InventoryService } from '../../backend/services/inventory';
import { PromotionsService } from '../../backend/services/promotions';

import { UserRole } from '../../shared/enums/roles.enum';
import { BranchStatus } from '../../shared/enums/branch.enum';
import { OrderStatus } from '../../shared/enums/order.enum';
import { AuditAction } from '../../shared/enums/audit.enum';
import { BadRequestError, ValidationError } from '../../backend/errors/app-error';

describe('Phase 5 — Owner Platform, Dashboard, History, Settings & Data Management', () => {
  let db = createMemoryD1Database();
  let userRepo: UserRepository;
  let sessionRepo: SessionRepository;
  let branchRepo: BranchRepository;
  let orderRepo: OrderRepository;
  let paymentRepo: PaymentRepository;
  let productRepo: ProductRepository;
  let inventoryRepo: InventoryRepository;
  let auditRepo: AuditRepository;

  let dashboardService: DashboardService;
  let orderService: OrdersService;
  let branchService: BranchesService;
  let deletionService: DeletionService;

  beforeEach(async () => {
    db = createMemoryD1Database();
    const migrationsDir = path.resolve(process.cwd(), 'database', 'migrations');
    await runMigrations(db, migrationsDir);

    userRepo = new UserRepository(db);
    sessionRepo = new SessionRepository(db);
    branchRepo = new BranchRepository(db);
    orderRepo = new OrderRepository(db);
    paymentRepo = new PaymentRepository(db);
    productRepo = new ProductRepository(db);
    inventoryRepo = new InventoryRepository(db);
    auditRepo = new AuditRepository(db);

    const inventoryService = new InventoryService(inventoryRepo, auditRepo);
    const promotionsService = new PromotionsService(db, auditRepo);

    dashboardService = new DashboardService(db);
    orderService = new OrdersService(
      orderRepo,
      paymentRepo,
      productRepo,
      auditRepo,
      branchRepo,
      undefined,
      inventoryService,
      promotionsService
    );
    branchService = new BranchesService(branchRepo, db, auditRepo);
    deletionService = new DeletionService(db);

    // Setup initial seed records
    await userRepo.create({
      id: 'owner-1',
      firebase_uid: 'fb-owner-1',
      email: 'owner@melt.local',
      display_name: 'Store Owner',
      role: UserRole.OWNER,
      status: 'ACTIVE',
    });

    await userRepo.create({
      id: 'cust-1',
      firebase_uid: 'fb-cust-1',
      email: 'customer1@melt.local',
      display_name: 'Customer One',
      role: UserRole.CUSTOMER,
      status: 'ACTIVE',
    });

    await userRepo.create({
      id: 'cust-2',
      firebase_uid: 'fb-cust-2',
      email: 'customer2@melt.local',
      display_name: 'Customer Two',
      role: UserRole.CUSTOMER,
      status: 'ACTIVE',
    });

    await branchRepo.create({ id: 'branch-surat', name: 'Melt Surat', code: 'BR-SURAT-01' });
    await branchRepo.createDefaultSettings('branch-surat');

    await branchRepo.create({ id: 'branch-mumbai', name: 'Melt Mumbai', code: 'BR-MUMBAI-01' });
    await branchRepo.createDefaultSettings('branch-mumbai');
  });

  describe('1. Dashboard Aggregations & Metrics', () => {
    it('aggregates revenue, order counts, status breakdown, and top products across branches', async () => {
      // Create category and products
      await db.prepare(`
        INSERT INTO categories (id, branch_id, name, sort_order, created_at, updated_at)
        VALUES ('cat-1', 'branch-surat', 'Ice Cream', 1, datetime('now'), datetime('now'))
      `).run();

      await db.prepare(`
        INSERT INTO products (id, branch_id, category_id, name, price, active, created_at, updated_at)
        VALUES 
          ('prod-mango', 'branch-surat', 'cat-1', 'Mango Scoop', 100, 1, datetime('now'), datetime('now')),
          ('prod-choco', 'branch-surat', 'cat-1', 'Belgian Chocolate', 150, 1, datetime('now'), datetime('now'))
      `).run();

      // Create orders in Surat branch
      const nowIso = new Date().toISOString();
      await db.prepare(`
        INSERT INTO orders (id, order_number, branch_id, customer_user_id, status, subtotal, discount, tax, total, payment_status, placed_at, expires_at, created_at, updated_at)
        VALUES 
          ('ord-1', 'ORD-001', 'branch-surat', 'cust-1', 'COMPLETED', 250, 0, 0, 250, 'VERIFIED', ?, ?, ?, ?),
          ('ord-2', 'ORD-002', 'branch-surat', 'cust-2', 'CONFIRMED', 100, 0, 0, 100, 'VERIFIED', ?, ?, ?, ?),
          ('ord-3', 'ORD-003', 'branch-surat', 'cust-1', 'CANCELLED', 150, 0, 0, 150, 'FAILED', ?, ?, ?, ?)
      `).bind(
        nowIso, nowIso, nowIso, nowIso,
        nowIso, nowIso, nowIso, nowIso,
        nowIso, nowIso, nowIso, nowIso
      ).run();

      // Create order items
      await db.prepare(`
        INSERT INTO order_items (id, order_id, product_id, product_name_snapshot, unit_price_snapshot, quantity, line_total, created_at, updated_at)
        VALUES
          ('item-1', 'ord-1', 'prod-mango', 'Mango Scoop', 100, 1, 100, datetime('now'), datetime('now')),
          ('item-2', 'ord-1', 'prod-choco', 'Belgian Chocolate', 150, 1, 150, datetime('now'), datetime('now')),
          ('item-3', 'ord-2', 'prod-mango', 'Mango Scoop', 100, 1, 100, datetime('now'), datetime('now'))
      `).run();

      // Run dashboard query for Surat
      const summarySurat = await dashboardService.getSummary({
        branchId: 'branch-surat',
        preset: 'today',
      });

      assert.strictEqual(summarySurat.branchId, 'branch-surat');
      assert.strictEqual(summarySurat.branchName, 'Melt Surat');
      // Revenue should count non-cancelled, non-expired orders (250 + 100 = 350)
      assert.strictEqual(summarySurat.metrics.revenue, 350);
      assert.strictEqual(summarySurat.metrics.totalOrders, 3);
      assert.strictEqual(summarySurat.metrics.completedOrders, 1);
      assert.strictEqual(summarySurat.metrics.confirmedOrders, 1);
      assert.strictEqual(summarySurat.metrics.cancelledOrders, 1);
      // Average Order Value = 350 / 2 = 175
      assert.strictEqual(summarySurat.metrics.averageOrderValue, 175);

      // Verify top products
      assert.strictEqual(summarySurat.topProducts.length, 2);
      const mango = summarySurat.topProducts.find((p) => p.productId === 'prod-mango');
      assert.ok(mango);
      assert.strictEqual(mango.quantitySold, 2);
      assert.strictEqual(mango.revenue, 200);

      // Run aggregated dashboard query for ALL branches
      const summaryAll = await dashboardService.getSummary({
        preset: 'today',
      });
      assert.strictEqual(summaryAll.branchId, null);
      assert.strictEqual(summaryAll.metrics.revenue, 350);
      assert.strictEqual(summaryAll.metrics.totalOrders, 3);
    });

    it('reports low stock alerts when materials or products are below thresholds', async () => {
      // Insert raw material with low quantity
      await db.prepare(`
        INSERT INTO raw_materials (id, branch_id, name, unit, current_quantity, reorder_threshold, active, created_at, updated_at)
        VALUES ('mat-milk', 'branch-surat', 'Whole Cream Milk', 'LITERS', 5, 20, 1, datetime('now'), datetime('now'))
      `).run();

      const summary = await dashboardService.getSummary({
        branchId: 'branch-surat',
        preset: 'today',
      });

      assert.strictEqual(summary.inventoryAlerts.lowStockRawMaterials.length, 1);
      assert.strictEqual(summary.inventoryAlerts.lowStockRawMaterials[0].name, 'Whole Cream Milk');
      assert.strictEqual(summary.inventoryAlerts.lowStockRawMaterials[0].quantity, 5);
      assert.strictEqual(summary.inventoryAlerts.lowStockRawMaterials[0].reorderThreshold, 20);
    });
  });

  describe('2. Order History Query & Pagination', () => {
    beforeEach(async () => {
      const now = new Date();
      // Insert multiple orders across branches and customers
      for (let i = 1; i <= 15; i++) {
        const branch = i % 2 === 0 ? 'branch-mumbai' : 'branch-surat';
        const cust = i % 3 === 0 ? 'cust-2' : 'cust-1';
        const status = i === 1 ? 'CANCELLED' : i === 2 ? 'EXPIRED' : 'COMPLETED';
        const dateIso = new Date(now.getTime() - i * 3600 * 1000).toISOString();

        await db.prepare(`
          INSERT INTO orders (id, order_number, branch_id, customer_user_id, status, subtotal, discount, tax, total, payment_status, placed_at, expires_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 100, 0, 0, 100, 'VERIFIED', ?, ?, ?, ?)
        `).bind(
          `ord-hist-${i}`,
          `ORD-${1000 + i}`,
          branch,
          cust,
          status,
          dateIso,
          dateIso,
          dateIso,
          dateIso
        ).run();
      }
    });

    it('supports database-side pagination with total count and page limits', async () => {
      const page1 = await orderService.listOrderHistory({
        actorRole: UserRole.OWNER,
        actorUserId: 'owner-1',
        page: 1,
        limit: 5,
      });

      assert.strictEqual(page1.totalCount, 15);
      assert.strictEqual(page1.totalPages, 3);
      assert.strictEqual(page1.page, 1);
      assert.strictEqual(page1.limit, 5);
      assert.strictEqual(page1.orders.length, 5);

      const page2 = await orderService.listOrderHistory({
        actorRole: UserRole.OWNER,
        actorUserId: 'owner-1',
        page: 2,
        limit: 5,
      });

      assert.strictEqual(page2.orders.length, 5);
      assert.notStrictEqual(page1.orders[0].id, page2.orders[0].id);
    });

    it('filters order history by branchId, customerUserId, and status', async () => {
      // Filter by branch
      const suratOrders = await orderService.listOrderHistory({
        actorRole: UserRole.OWNER,
        actorUserId: 'owner-1',
        branchId: 'branch-surat',
      });
      assert.ok(suratOrders.totalCount > 0);
      assert.ok(suratOrders.orders.every((o) => o.branch_id === 'branch-surat'));

      // Filter by customer
      const cust2Orders = await orderService.listOrderHistory({
        actorRole: UserRole.OWNER,
        actorUserId: 'owner-1',
        customerUserId: 'cust-2',
      });
      assert.ok(cust2Orders.totalCount > 0);
      assert.ok(cust2Orders.orders.every((o) => o.customer_user_id === 'cust-2'));

      // Filter by status
      const cancelledOrders = await orderService.listOrderHistory({
        actorRole: UserRole.OWNER,
        actorUserId: 'owner-1',
        status: OrderStatus.CANCELLED,
      });
      assert.strictEqual(cancelledOrders.totalCount, 1);
      assert.strictEqual(cancelledOrders.orders[0].status, OrderStatus.CANCELLED);
    });
  });

  describe('3. Branch Management & Lifecycle', () => {
    it('creates a new branch, provisions default settings, and audits the event', async () => {
      const created = await branchService.createBranch('owner-1', {
        code: 'BR-AHMEDABAD-01',
        name: 'Melt Ahmedabad',
        address: 'CG Road, Ahmedabad',
        phone: '+91 99999 88888',
      });

      assert.ok(created.branch.id);
      assert.strictEqual(created.branch.code, 'BR-AHMEDABAD-01');
      assert.strictEqual(created.branch.status, 'ACTIVE');

      // Verify settings were auto-provisioned
      const detail = await branchService.getBranchDetail(created.branch.id);
      assert.ok(detail?.settings);
      assert.strictEqual(detail?.settings?.session_timeout_value, 8);
      assert.strictEqual(detail?.settings?.session_timeout_unit, 'HOURS');

      // Verify audit log
      const logs = await auditRepo.listRecent(10);
      const createLog = logs.find((l) => l.action === AuditAction.BRANCH_CREATED);
      assert.ok(createLog);
      assert.strictEqual(createLog.actor_user_id, 'owner-1');
    });

    it('updates branch details and audits changes', async () => {
      const updated = await branchService.updateBranch('owner-1', 'branch-surat', {
        name: 'Melt Surat Flagship',
        address: 'VIP Road, Vesu, Surat',
      });

      assert.strictEqual(updated.branch.name, 'Melt Surat Flagship');
      assert.strictEqual(updated.branch.address, 'VIP Road, Vesu, Surat');

      const logs = await auditRepo.listRecent(10);
      const updateLog = logs.find((l) => l.action === AuditAction.BRANCH_UPDATED);
      assert.ok(updateLog);
    });

    it('toggles branch status between ACTIVE and INACTIVE', async () => {
      const deactivated = await branchService.setBranchStatus('owner-1', 'branch-mumbai', BranchStatus.INACTIVE);
      assert.strictEqual(deactivated.status, 'INACTIVE');

      const detail = await branchService.getBranchDetail('branch-mumbai');
      assert.strictEqual(detail?.branch.status, 'INACTIVE');

      const logs = await auditRepo.listRecent(10);
      const statusLog = logs.find((l) => l.action === AuditAction.BRANCH_DEACTIVATED);
      assert.ok(statusLog);
    });
  });

  describe('4. Branch Settings & Session Timeout Policies', () => {
    it('updates session timeout and operational limits with validation', async () => {
      const updatedSettings = await branchService.updateBranchSettings('owner-1', 'branch-surat', {
        session_timeout_value: 30,
        session_timeout_unit: 'MINUTES',
        order_expiry_minutes: 20,
        order_edit_window_minutes: 10,
        configuration_json: JSON.stringify({ isOperational: true }),
      });

      assert.strictEqual(updatedSettings.session_timeout_value, 30);
      assert.strictEqual(updatedSettings.session_timeout_unit, 'MINUTES');
      assert.strictEqual(updatedSettings.order_expiry_minutes, 20);
      assert.strictEqual(updatedSettings.order_edit_window_minutes, 10);

      // Verify audit log
      const logs = await auditRepo.listRecent(10);
      const settingsLog = logs.find((l) => l.action === AuditAction.SETTINGS_UPDATED);
      assert.ok(settingsLog);
    });

    it('rejects order expiry less than order edit window', async () => {
      await assert.rejects(
        async () => {
          await branchService.updateBranchSettings('owner-1', 'branch-surat', {
            order_expiry_minutes: 5,
            order_edit_window_minutes: 15,
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof BadRequestError || err instanceof ValidationError);
          assert.match((err as Error).message, /cannot be less than order_edit_window_minutes/i);
          return true;
        }
      );
    });
  });

  describe('5. Data Management, Dependencies & Safe Deletion', () => {
    it('inspects branch dependencies and prevents hard deletion when orders exist', async () => {
      // Put an order in Surat
      const nowIso = new Date().toISOString();
      await db.prepare(`
        INSERT INTO orders (id, order_number, branch_id, customer_user_id, status, subtotal, discount, tax, total, payment_status, placed_at, expires_at, created_at, updated_at)
        VALUES ('ord-dep-1', 'ORD-DEP-1', 'branch-surat', 'cust-1', 'COMPLETED', 100, 0, 0, 100, 'VERIFIED', ?, ?, ?, ?)
      `).bind(nowIso, nowIso, nowIso, nowIso).run();

      const preview = await deletionService.previewBranchDeletion('branch-surat');
      assert.strictEqual(preview.canHardDelete, false);
      assert.ok(preview.blockingReasons.length > 0);
      assert.strictEqual(preview.counts.orders, 1);

      // Safe deactivation works
      const deactivateRes = await deletionService.deactivateBranch('owner-1', 'branch-surat');
      assert.strictEqual(deactivateRes.status, 'INACTIVE');
      assert.strictEqual(deactivateRes.success, true);
    });

    it('anonymizes customer personal data while preserving orders and revoking active sessions', async () => {
      // Create session for cust-1
      await sessionRepo.create({
        id: 'sess-1',
        session_token_hash: 'hash-1',
        user_id: 'cust-1',
        scope: 'GLOBAL',
        authenticated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      });

      // Put an order for cust-1
      const nowIso = new Date().toISOString();
      await db.prepare(`
        INSERT INTO orders (id, order_number, branch_id, customer_user_id, status, subtotal, discount, tax, total, payment_status, placed_at, expires_at, created_at, updated_at)
        VALUES ('ord-cust-1', 'ORD-CUST-1', 'branch-surat', 'cust-1', 'COMPLETED', 200, 0, 0, 200, 'VERIFIED', ?, ?, ?, ?)
      `).bind(nowIso, nowIso, nowIso, nowIso).run();

      // Run customer anonymization
      const result = await deletionService.anonymizeCustomer('owner-1', 'cust-1', 'User requested GDPR erasure');
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.customerUserId, 'cust-1');
      assert.strictEqual(result.preservedOrdersCount, 1);
      assert.strictEqual(result.revokedSessionsCount, 1);

      // Verify user record was scrubbed
      const user = await userRepo.findById('cust-1');
      assert.ok(user);
      assert.strictEqual(user.display_name, 'Anonymized Customer');
      assert.strictEqual(user.email, 'anonymized-cust-1@deleted.local');
      assert.strictEqual(user.status, 'INACTIVE');

      // Verify orders still exist for bookkeeping
      const order = await orderRepo.findById('ord-cust-1');
      assert.ok(order);
      assert.strictEqual(order.customer_user_id, 'cust-1');
      assert.strictEqual(order.total, 200);

      // Verify active sessions were revoked
      const activeSessions = await sessionRepo.findActiveByUserId('cust-1');
      assert.strictEqual(activeSessions.length, 0);

      // Verify audit trail
      const logs = await auditRepo.listRecent(10);
      const anonLog = logs.find((l) => l.action === AuditAction.DATA_ANONYMIZED);
      assert.ok(anonLog);
    });
  });
});
