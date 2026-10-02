import { D1DatabaseLike } from '../types';
import { seedData } from '../fixtures';
import { runComprehensiveSeed, ComprehensiveSeedResult } from './comprehensive-seed';

export interface DevSeedOptions {
  comprehensive?: boolean;
}

export type DevSeedResult = {
  branches: number;
  categories: number;
  products: number;
  rawMaterials: number;
  inventory: number;
} & Partial<ComprehensiveSeedResult>;

export async function runDevSeed(
  db: D1DatabaseLike,
  options?: DevSeedOptions,
): Promise<DevSeedResult> {
  if (options?.comprehensive) {
    return await runComprehensiveSeed(db);
  }

  await db.exec('PRAGMA foreign_keys = ON;');
  const now = new Date().toISOString();

  // 1. Seed branches
  for (const b of seedData.branches) {
    await db
      .prepare(`
        INSERT INTO branches (id, name, code, status, address, phone, email, timezone, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          status = excluded.status,
          updated_at = excluded.updated_at
      `)
      .bind(b.id, b.name, b.code, b.status, b.address ?? null, b.phone ?? null, b.email ?? null, b.timezone, now, now)
      .run();
  }

  // 2. Seed categories
  for (const c of seedData.categories) {
    await db
      .prepare(`
        INSERT INTO categories (id, branch_id, name, active, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          active = excluded.active,
          sort_order = excluded.sort_order,
          updated_at = excluded.updated_at
      `)
      .bind(c.id, c.branch_id, c.name, c.active, c.sort_order, now, now)
      .run();
  }

  // 3. Seed products
  for (const p of seedData.products) {
    await db
      .prepare(`
        INSERT INTO products (id, branch_id, category_id, name, description, price, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          price = excluded.price,
          active = excluded.active,
          updated_at = excluded.updated_at
      `)
      .bind(p.id, p.branch_id, p.category_id, p.name, p.description, p.price, p.active, now, now)
      .run();
  }

  // 4. Seed raw materials
  for (const r of seedData.raw_materials) {
    await db
      .prepare(`
        INSERT INTO raw_materials (id, branch_id, name, unit, current_quantity, reorder_threshold, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          current_quantity = excluded.current_quantity,
          reorder_threshold = excluded.reorder_threshold,
          updated_at = excluded.updated_at
      `)
      .bind(r.id, r.branch_id, r.name, r.unit, r.current_quantity, r.reorder_threshold, r.active, now, now)
      .run();
  }

  // 5. Seed inventory
  for (const inv of seedData.inventory) {
    await db
      .prepare(`
        INSERT INTO inventory (id, branch_id, product_id, quantity, reorder_threshold, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(branch_id, product_id) DO UPDATE SET
          quantity = excluded.quantity,
          reorder_threshold = excluded.reorder_threshold,
          updated_at = excluded.updated_at
      `)
      .bind(inv.id, inv.branch_id, inv.product_id, inv.quantity, inv.reorder_threshold, now)
      .run();
  }

  return {
    branches: seedData.branches.length,
    categories: seedData.categories.length,
    products: seedData.products.length,
    rawMaterials: seedData.raw_materials.length,
    inventory: seedData.inventory.length,
  };
}
