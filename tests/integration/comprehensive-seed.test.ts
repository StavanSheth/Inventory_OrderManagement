import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createMemoryD1Database } from '../../database/adapter.sqlite';
import { runMigrations } from '../../database/migrations/runner';
import { runComprehensiveSeed } from '../../database/seeds/comprehensive-seed';
import { OrderStatus, PaymentStatus, PaymentMethod } from '../../shared/enums/order.enum';
import { InventoryMovementType } from '../../shared/enums/inventory.enum';
import { OfferType, DiscountType } from '../../shared/enums/promotions.enum';
import { UserRole } from '../../shared/enums/roles.enum';
import { BranchStatus } from '../../shared/enums/branch.enum';
import { verifyPin } from '../../backend/services/auth/pin-hasher';

describe('Comprehensive Permutations Seed Data', () => {
  it('seeds all permutation combinations and maintains relational/trigger integrity', async () => {
    const db = createMemoryD1Database();
    const migrationsDir = path.resolve(process.cwd(), 'database', 'migrations');
    await runMigrations(db, migrationsDir);

    const counts = await runComprehensiveSeed(db);

    // Verify entity counts
    assert.strictEqual(counts.branches, 4, 'Must seed 4 branches');
    assert.strictEqual(counts.users, 8, 'Must seed 8 users');
    assert.strictEqual(counts.orders, 21, 'Must seed 21 orders');
    assert.strictEqual(counts.payments, 21, 'Must seed 21 payments');
    assert.ok(counts.products >= 10, 'Must seed at least 10 products');
    assert.ok(counts.inventoryMovements >= 10, 'Must seed inventory movements');
    assert.ok(counts.productComponents >= 10, 'Must seed recipe components (BOM)');

    // 1. Verify Branch Status permutations
    const branchStatuses = await db
      .prepare('SELECT DISTINCT status FROM branches')
      .all<{ status: string }>();
    const branchStatusSet = new Set(branchStatuses.results.map((r) => r.status));
    assert.ok(branchStatusSet.has(BranchStatus.ACTIVE), 'Must have ACTIVE branch');
    assert.ok(branchStatusSet.has(BranchStatus.INACTIVE), 'Must have INACTIVE branch');
    assert.ok(branchStatusSet.has(BranchStatus.CLOSED), 'Must have CLOSED branch');

    // 2. Verify User Roles & PIN Verification
    const users = await db
      .prepare('SELECT id, role, pin_hash FROM users')
      .all<{ id: string; role: string; pin_hash: string | null }>();
    const userRoleSet = new Set(users.results.map((u) => u.role));
    assert.ok(userRoleSet.has(UserRole.OWNER), 'Must have OWNER user');
    assert.ok(userRoleSet.has(UserRole.CUSTOMER), 'Must have CUSTOMER users');

    const ownerUser = users.results.find((u) => u.role === UserRole.OWNER);
    assert.ok(ownerUser && ownerUser.pin_hash);
    const pinValid = await verifyPin('123456', ownerUser.pin_hash);
    assert.strictEqual(pinValid, true, 'Owner PIN hash must verify with 123456');

    // 3. Verify OrderStatus permutations (All 7 statuses present)
    const orderStatuses = await db
      .prepare('SELECT DISTINCT status FROM orders')
      .all<{ status: string }>();
    const orderStatusSet = new Set(orderStatuses.results.map((r) => r.status));
    for (const status of Object.values(OrderStatus)) {
      assert.ok(orderStatusSet.has(status), `OrderStatus ${status} must be represented in seeded orders`);
    }

    // 4. Verify PaymentStatus permutations (All 6 statuses present)
    const paymentStatuses = await db
      .prepare('SELECT DISTINCT status FROM payments')
      .all<{ status: string }>();
    const paymentStatusSet = new Set(paymentStatuses.results.map((r) => r.status));
    for (const status of Object.values(PaymentStatus)) {
      assert.ok(paymentStatusSet.has(status), `PaymentStatus ${status} must be represented in seeded payments`);
    }

    // 5. Verify PaymentMethod permutations
    const paymentMethods = await db
      .prepare('SELECT DISTINCT method FROM payments')
      .all<{ method: string }>();
    const paymentMethodSet = new Set(paymentMethods.results.map((r) => r.method));
    assert.ok(paymentMethodSet.has(PaymentMethod.CASH));
    assert.ok(paymentMethodSet.has(PaymentMethod.UPI));
    assert.ok(paymentMethodSet.has(PaymentMethod.CARD));
    assert.ok(paymentMethodSet.has(PaymentMethod.ONLINE));

    // 6. Verify Inventory Stock permutations (Normal, Low Stock, Zero Stock)
    const invRows = await db
      .prepare('SELECT quantity, reorder_threshold FROM inventory')
      .all<{ quantity: number; reorder_threshold: number }>();
    assert.ok(invRows.results.some((r) => r.quantity > r.reorder_threshold), 'Must have high stock items');
    assert.ok(invRows.results.some((r) => r.quantity <= r.reorder_threshold && r.quantity > 0), 'Must have low stock items');
    assert.ok(invRows.results.some((r) => r.quantity === 0), 'Must have out-of-stock items (quantity = 0)');

    // 7. Verify Raw Material Stock permutations
    const matRows = await db
      .prepare('SELECT current_quantity, reorder_threshold FROM raw_materials')
      .all<{ current_quantity: number; reorder_threshold: number }>();
    assert.ok(matRows.results.some((r) => r.current_quantity > r.reorder_threshold), 'Must have sufficient raw materials');
    assert.ok(matRows.results.some((r) => r.current_quantity <= r.reorder_threshold && r.current_quantity > 0), 'Must have low stock raw materials');
    assert.ok(matRows.results.some((r) => r.current_quantity === 0), 'Must have zero stock raw materials');

    // 8. Verify Inventory Movement Types (all 10 movement types)
    const movTypes = await db
      .prepare('SELECT DISTINCT movement_type FROM inventory_movements')
      .all<{ movement_type: string }>();
    const movTypeSet = new Set(movTypes.results.map((r) => r.movement_type));
    for (const movType of Object.values(InventoryMovementType)) {
      assert.ok(movTypeSet.has(movType), `Movement type ${movType} must be seeded`);
    }

    // 9. Verify Promotion Types
    const offTypes = await db
      .prepare('SELECT DISTINCT offer_type FROM offers')
      .all<{ offer_type: string }>();
    const offTypeSet = new Set(offTypes.results.map((r) => r.offer_type));
    for (const off of Object.values(OfferType)) {
      assert.ok(offTypeSet.has(off), `OfferType ${off} must be seeded`);
    }

    const coupTypes = await db
      .prepare('SELECT DISTINCT discount_type FROM coupons')
      .all<{ discount_type: string }>();
    const coupTypeSet = new Set(coupTypes.results.map((r) => r.discount_type));
    for (const dt of Object.values(DiscountType)) {
      assert.ok(coupTypeSet.has(dt), `DiscountType ${dt} must be seeded`);
    }

    // 10. Verify Bill of Materials (product_components)
    const components = await db
      .prepare(`
        SELECT pc.id, p.name as product_name, rm.name as material_name, pc.quantity_required, pc.unit
        FROM product_components pc
        JOIN products p ON p.id = pc.product_id
        JOIN raw_materials rm ON rm.id = pc.raw_material_id
      `)
      .all<{ id: string; product_name: string; material_name: string; quantity_required: number; unit: string }>();
    assert.ok(components.results.length >= 10, 'Must have at least 10 recipe component linkages');

    // 11. Verify Order Totals vs Payment Totals Invariant
    const orderPaymentCheck = await db
      .prepare(`
        SELECT o.id, o.total, p.amount, p.status as payment_status
        FROM orders o
        JOIN payments p ON p.order_id = o.id
      `)
      .all<{ id: string; total: number; amount: number; payment_status: string }>();

    for (const row of orderPaymentCheck.results) {
      assert.strictEqual(row.amount, row.total, `Payment amount for order ${row.id} must equal order total`);
    }

    // 12. Re-seeding idempotency check
    const secondCounts = await runComprehensiveSeed(db);
    assert.strictEqual(secondCounts.orders, counts.orders, 'Re-running comprehensive seed must be idempotent');
  });
});
