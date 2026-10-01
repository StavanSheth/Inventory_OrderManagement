import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createMemoryD1Database } from '../../database/adapter.sqlite';
import { runMigrations } from '../../database/migrations/runner';
import { runDevSeed } from '../../database/seeds/dev-seed';
import { BranchRepository } from '../../database/repositories/branch.repository';
import { ProductRepository } from '../../database/repositories/product.repository';
import { buildSuccessEnvelope } from '../../api/serializers/response';

describe('End-to-End Foundation Integration', () => {
  it('runs complete lifecycle: migration -> seed -> repository -> serialized API response', async () => {
    // 1. Database setup & migrations
    const db = createMemoryD1Database();
    const migrationsDir = path.resolve(process.cwd(), 'database', 'migrations');
    const applied = await runMigrations(db, migrationsDir);
    assert.ok(applied.length > 0);

    // 2. Run seed
    const seedResult = await runDevSeed(db);
    assert.strictEqual(seedResult.branches, 2);

    // 3. Query via repositories
    const branchRepo = new BranchRepository(db);
    const productRepo = new ProductRepository(db);

    const branch = await branchRepo.findById('branch-alpha');
    assert.ok(branch);
    assert.strictEqual(branch.code, 'ALPHA-01');

    const products = await productRepo.listByBranch('branch-alpha');
    assert.ok(products.length > 0);

    // 4. Wrap in API envelope
    const envelope = buildSuccessEnvelope({
      branch: branch.name,
      productsCount: products.length,
    });

    assert.strictEqual(envelope.success, true);
    assert.strictEqual(envelope.data.branch, 'Melt Parlour - Downtown Alpha');
    assert.ok(envelope.data.productsCount >= 2);
  });
});
