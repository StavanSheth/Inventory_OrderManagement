import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createMemoryD1Database } from '../../database/adapter.sqlite';
import { runMigrations } from '../../database/migrations/runner';
import { runDevSeed } from '../../database/seeds/dev-seed';
import { BranchRepository } from '../../database/repositories/branch.repository';
import { OrderRepository } from '../../database/repositories/order.repository';
import { InventoryRepository } from '../../database/repositories/inventory.repository';
import { BranchesService } from '../../backend/services/branches';
import { OrdersService } from '../../backend/services/orders';
import { InventoryService } from '../../backend/services/inventory';
import { PromotionsService } from '../../backend/services/promotions';
import { DashboardService } from '../../backend/services/dashboard';

describe('Backend Services Pipeline Integration', () => {
  let db = createMemoryD1Database();
  let branchesService: BranchesService;
  let ordersService: OrdersService;
  let inventoryService: InventoryService;
  let promotionsService: PromotionsService;
  let dashboardService: DashboardService;

  beforeEach(async () => {
    db = createMemoryD1Database();
    const migrationsDir = path.resolve(process.cwd(), 'database', 'migrations');
    await runMigrations(db, migrationsDir);
    await runDevSeed(db);

    const branchRepo = new BranchRepository(db);
    const orderRepo = new OrderRepository(db);
    const inventoryRepo = new InventoryRepository(db);

    branchesService = new BranchesService(branchRepo, db);
    ordersService = new OrdersService(orderRepo);
    inventoryService = new InventoryService(inventoryRepo);
    promotionsService = new PromotionsService(db);
    dashboardService = new DashboardService(db);
  });

  it('proves BranchesService operations', async () => {
    const branches = await branchesService.listBranches();
    assert.strictEqual(branches.length, 2);

    const branch = await branchesService.getBranchById('branch-alpha');
    assert.ok(branch);
    assert.strictEqual(branch.code, 'ALPHA-01');

    const nonExistent = await branchesService.getBranchById('non-existent');
    assert.strictEqual(nonExistent, null);
  });

  it('proves InventoryService operations and low stock queries', async () => {
    const stockList = await inventoryService.listBranchStock('branch-alpha');
    assert.ok(stockList.length > 0);

    const singleStock = await inventoryService.getStock('branch-alpha', 'prod-alpha-pistachio');
    assert.ok(singleStock);
    assert.strictEqual(singleStock.quantity, 45);

    const emptyStock = await inventoryService.getStock('branch-alpha', 'non-existent-product');
    assert.strictEqual(emptyStock, null);
  });

  it('proves PromotionsService offer and coupon lookups', async () => {
    // Insert a test coupon into branch-alpha
    await db
      .prepare(`
        INSERT INTO coupons (id, branch_id, code, name, discount_type, discount_value, minimum_order_value, start_at, end_at, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        'coup-alpha-10',
        'branch-alpha',
        'MELT10',
        '10% Off',
        'PERCENTAGE',
        10,
        100,
        new Date().toISOString(),
        new Date(Date.now() + 86400000).toISOString(),
        1,
        new Date().toISOString(),
        new Date().toISOString(),
      )
      .run();

    const coupon = await promotionsService.getCouponByCode('branch-alpha', 'MELT10');
    assert.ok(coupon);
    assert.strictEqual(coupon.code, 'MELT10');
    assert.strictEqual(coupon.discount_value, 10);

    // Coupon not found in branch-beta
    const betaCoupon = await promotionsService.getCouponByCode('branch-beta', 'MELT10');
    assert.strictEqual(betaCoupon, null);
  });

  it('proves OrdersService operations', async () => {
    const orders = await ordersService.listOrders('branch-alpha');
    assert.ok(Array.isArray(orders));
    const nonExistent = await ordersService.getOrderById('branch-alpha', 'non-existent-order');
    assert.strictEqual(nonExistent, null);
  });

  it('proves DashboardService metrics aggregation', async () => {
    const metrics = await dashboardService.getBranchMetrics('branch-alpha');
    assert.strictEqual(metrics.branchId, 'branch-alpha');
    assert.strictEqual(typeof metrics.totalOrders, 'number');
    assert.strictEqual(typeof metrics.lowStockItemsCount, 'number');
  });
});
