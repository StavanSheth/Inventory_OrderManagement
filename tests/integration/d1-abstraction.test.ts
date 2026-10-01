import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createMemoryD1Database } from '../../database/adapter.sqlite';
import { createProductionDatabase } from '../../database/adapter';
import { getDatabase, setFallbackDatabaseProvider, resetDatabaseProvider } from '../../database/runtime';
import { runMigrations } from '../../database/migrations/runner';
import { D1DatabaseLike } from '../../database/types';

describe('D1 Abstraction & Runtime Resolution', () => {
  let db: D1DatabaseLike;

  beforeEach(async () => {
    db = createMemoryD1Database();
    const migrationsDir = path.resolve(process.cwd(), 'database', 'migrations');
    await runMigrations(db, migrationsDir);
  });

  afterEach(() => {
    resetDatabaseProvider();
  });

  it('validates statement execution: prepare, bind, first, all, run, batch', async () => {
    // 1. run insert
    const insertRes = await db
      .prepare('INSERT INTO branches (id, name, code, status, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind('br-abs-1', 'Abstract Parlour', 'ABS-01', 'ACTIVE', 'UTC', new Date().toISOString(), new Date().toISOString())
      .run();

    assert.strictEqual(insertRes.success, true);

    // 2. first query
    const firstRow = await db
      .prepare('SELECT code, name FROM branches WHERE id = ?')
      .bind('br-abs-1')
      .first<{ code: string; name: string }>();

    assert.ok(firstRow);
    assert.strictEqual(firstRow.code, 'ABS-01');

    // 3. all query
    const allRows = await db
      .prepare('SELECT id FROM branches WHERE status = ?')
      .bind('ACTIVE')
      .all<{ id: string }>();

    assert.strictEqual(allRows.success, true);
    assert.ok(allRows.results.length >= 1);

    // 4. batch statements
    const now = new Date().toISOString();
    const batchRes = await db.batch([
      db.prepare('INSERT INTO branches (id, name, code, status, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind('br-b1', 'Batch 1', 'B1-01', 'ACTIVE', 'UTC', now, now),
      db.prepare('INSERT INTO branches (id, name, code, status, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind('br-b2', 'Batch 2', 'B2-02', 'ACTIVE', 'UTC', now, now),
    ]);

    assert.strictEqual(batchRes.length, 2);
  });

  it('enforces CHECK constraints (negative price rejection)', async () => {
    // Insert valid branch and category
    const now = new Date().toISOString();
    await db.prepare('INSERT INTO branches (id, name, code, status, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind('br-chk', 'Check Branch', 'CHK-01', 'ACTIVE', 'UTC', now, now).run();
    await db.prepare('INSERT INTO categories (id, branch_id, name, active, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind('cat-chk', 'br-chk', 'Scoops', 1, 0, now, now).run();

    // Inserting negative price must fail CHECK constraint
    await assert.rejects(
      async () => {
        await db.prepare('INSERT INTO products (id, branch_id, category_id, name, price, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)')
          .bind('prod-neg', 'br-chk', 'cat-chk', 'Bad Price Product', -50, now, now)
          .run();
      },
      /CHECK constraint failed/i,
      'Negative product price must be rejected by CHECK constraint',
    );
  });

  it('proves database runtime resolution logic', () => {
    // 1. When context has DB, resolves production database
    const resolvedProd = getDatabase({ env: { DB: db } });
    assert.ok(resolvedProd);

    // 2. When provider is set, fallback provider resolves DB
    setFallbackDatabaseProvider(() => db);
    const resolvedFallback = getDatabase({});
    assert.ok(resolvedFallback);

    // 3. When nothing is set, throws a clear diagnostic error
    resetDatabaseProvider();
    assert.throws(
      () => getDatabase({}),
      /No D1 database binding found/i,
    );
  });

  it('createProductionDatabase throws when binding is missing', () => {
    assert.throws(
      () => createProductionDatabase(undefined),
      /D1 database binding "DB" is not available/i,
    );
  });
});
