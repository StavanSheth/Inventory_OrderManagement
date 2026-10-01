import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { createFileD1Database } from '../../database/adapter.sqlite';
import { runMigrations, getAppliedMigrations } from '../../database/migrations/runner';
import { runDevSeed } from '../../database/seeds/dev-seed';
import { BranchRepository } from '../../database/repositories/branch.repository';

describe('Persistent SQLite Database Integration', () => {
  const testDbDir = path.resolve(process.cwd(), '.data', 'test-runs');
  const testDbPath = path.resolve(testDbDir, `test-${Date.now()}.sqlite`);
  const migrationsDir = path.resolve(process.cwd(), 'database', 'migrations');

  after(() => {
    // Clean up temporary test sqlite file and directory
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(testDbDir)) fs.rmdirSync(testDbDir, { recursive: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('creates, migrates, and persists data across separate connection instances', async () => {
    // Instance 1: Run migrations and seed
    const db1 = createFileD1Database(testDbPath);
    const applied = await runMigrations(db1, migrationsDir);
    assert.ok(applied.length > 0);

    const seedRes = await runDevSeed(db1);
    assert.strictEqual(seedRes.branches, 2);

    const appliedList = await getAppliedMigrations(db1);
    assert.ok(appliedList.length > 0);

    // Verify file exists on disk
    assert.ok(fs.existsSync(testDbPath), 'Persistent database file must exist on disk');

    // Instance 2: Connect via a new adapter to the same file
    const db2 = createFileD1Database(testDbPath);
    const branchRepo = new BranchRepository(db2);
    const branches = await branchRepo.listAll();

    assert.strictEqual(branches.length, 2, 'Data must persist across separate database adapter instances');
    const alpha = await branchRepo.findById('branch-alpha');
    assert.ok(alpha);
    assert.strictEqual(alpha.code, 'ALPHA-01');

    // Re-running migration on db2 must be idempotent
    const secondRun = await runMigrations(db2, migrationsDir);
    assert.strictEqual(secondRun.length, 0, 'No migrations should re-run on already migrated DB');
  });
});
