import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createMemoryD1Database } from '../../database/adapter.sqlite';
import { runMigrations } from '../../database/migrations/runner';
import { runDevSeed } from '../../database/seeds/dev-seed';

describe('Seed Data & Branch Isolation', () => {
  it('executes development seed and proves branch data isolation', async () => {
    const db = createMemoryD1Database();
    const migrationsDir = path.resolve(process.cwd(), 'database', 'migrations');
    await runMigrations(db, migrationsDir);

    const counts = await runDevSeed(db);
    assert.strictEqual(counts.branches, 2, 'Must seed exactly 2 branches');
    assert.ok(counts.categories >= 4, 'Must seed categories');
    assert.ok(counts.products >= 4, 'Must seed products');
    assert.ok(counts.inventory >= 4, 'Must seed inventory');

    // Verify Branch Alpha records
    const alphaCategories = await db
      .prepare('SELECT * FROM categories WHERE branch_id = ?')
      .bind('branch-alpha')
      .all<{ id: string; name: string }>();

    const betaCategories = await db
      .prepare('SELECT * FROM categories WHERE branch_id = ?')
      .bind('branch-beta')
      .all<{ id: string; name: string }>();

    assert.ok(alphaCategories.results.length > 0);
    assert.ok(betaCategories.results.length > 0);

    const alphaIds = new Set(alphaCategories.results.map((c) => c.id));
    const betaIds = new Set(betaCategories.results.map((c) => c.id));

    // Prove branch A has separate records from branch B (no overlapping category IDs)
    for (const id of alphaIds) {
      assert.ok(!betaIds.has(id), `Category ${id} must not be shared across branches`);
    }

    // Verify Branch Alpha products vs Branch Beta products
    const alphaProducts = await db
      .prepare('SELECT * FROM products WHERE branch_id = ?')
      .bind('branch-alpha')
      .all<{ id: string; name: string }>();

    const betaProducts = await db
      .prepare('SELECT * FROM products WHERE branch_id = ?')
      .bind('branch-beta')
      .all<{ id: string; name: string }>();

    assert.ok(alphaProducts.results.length > 0);
    assert.ok(betaProducts.results.length > 0);

    // Verify foreign key integrity rejects an orphan product without valid branch
    await assert.rejects(
      async () => {
        await db
          .prepare(`
            INSERT INTO products (id, branch_id, category_id, name, price, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?)
          `)
          .bind('orphan-prod', 'non-existent-branch', 'non-existent-cat', 'Ghost Scoop', 100, new Date().toISOString(), new Date().toISOString())
          .run();
      },
      /FOREIGN KEY constraint failed/i,
      'Foreign key constraint must reject orphan products',
    );
  });
});
