import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createMemoryD1Database, NodeSqliteD1Adapter } from '../../database/adapter.sqlite';
import { runMigrations } from '../../database/migrations/runner';

const EXPECTED_TABLES = [
  'branches',
  'users',
  'branch_memberships',
  'customer_profiles',
  'categories',
  'products',
  'raw_materials',
  'product_components',
  'inventory',
  'inventory_movements',
  'orders',
  'order_items',
  'payments',
  'offers',
  'coupons',
  'coupon_usages',
  'branch_settings',
  'application_sessions',
  'audit_logs',
  'messaging_campaigns',
  'deletion_jobs',
];

const EXPECTED_INDEXES = [
  'idx_orders_branch_created',
  'idx_orders_branch_status',
  'idx_orders_customer_created',
  'idx_orders_branch_order_number',
  'idx_orders_expires_status',
  'idx_order_items_order_id',
  'idx_products_branch_active',
  'idx_categories_branch_active',
  'idx_inventory_branch_product',
  'idx_inventory_movements_branch_created',
  'idx_coupon_usages_coupon_user',
  'idx_branch_memberships_user_branch',
];

describe('Schema & Migrations Integration', () => {
  it('builds the complete schema from empty database and verifies foreign keys and tables', async () => {
    const db = createMemoryD1Database();
    const migrationsDir = path.resolve(process.cwd(), 'database', 'migrations');

    const applied = await runMigrations(db, migrationsDir);
    assert.ok(applied.includes('0001_initial_schema.sql'), 'Initial migration was applied');

    // 1. Verify foreign keys are enabled
    const nativeDb = (db as NodeSqliteD1Adapter).getNativeDb();
    const fkRow = nativeDb.prepare('PRAGMA foreign_keys;').get() as { foreign_keys: number };
    assert.strictEqual(fkRow.foreign_keys, 1, 'Foreign keys must be enabled (1)');

    // 2. Verify all 21 tables exist
    const tableRows = nativeDb
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '_migrations'")
      .all() as { name: string }[];
    const tableNames = tableRows.map((r) => r.name);

    for (const expectedTable of EXPECTED_TABLES) {
      assert.ok(
        tableNames.includes(expectedTable),
        `Expected table '${expectedTable}' to exist in database`,
      );
    }

    // 3. Verify all required indexes exist
    const indexRows = nativeDb
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    const indexNames = indexRows.map((r) => r.name);

    for (const expectedIndex of EXPECTED_INDEXES) {
      assert.ok(
        indexNames.includes(expectedIndex),
        `Expected index '${expectedIndex}' to exist in database`,
      );
    }
  });

  it('is idempotent when re-running migrations', async () => {
    const db = createMemoryD1Database();
    const migrationsDir = path.resolve(process.cwd(), 'database', 'migrations');

    const firstRun = await runMigrations(db, migrationsDir);
    assert.ok(firstRun.length > 0);

    const secondRun = await runMigrations(db, migrationsDir);
    assert.strictEqual(secondRun.length, 0, 'Second run must apply 0 new migrations');
  });
});
