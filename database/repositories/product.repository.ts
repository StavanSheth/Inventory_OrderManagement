import { BaseRepository } from './base.repository';
import { Product, Category } from '../../shared/types/entities.types';

export interface CreateProductInput {
  id: string;
  branch_id: string;
  category_id: string;
  name: string;
  description?: string | null;
  price: number;
  active?: boolean;
  image_url?: string | null;
}

export interface CreateCategoryInput {
  id: string;
  branch_id: string;
  name: string;
  active?: boolean;
  sort_order?: number;
}

export class ProductRepository extends BaseRepository {
  async findById(id: string): Promise<Product | null> {
    return this.db
      .prepare('SELECT * FROM products WHERE id = ?')
      .bind(id)
      .first<Product>();
  }

  async findByBranch(branchId: string, productId: string): Promise<Product | null> {
    return this.db
      .prepare('SELECT * FROM products WHERE branch_id = ? AND id = ?')
      .bind(branchId, productId)
      .first<Product>();
  }

  async listByBranch(branchId: string, onlyActive: boolean = true): Promise<Product[]> {
    if (onlyActive) {
      const res = await this.db
        .prepare('SELECT * FROM products WHERE branch_id = ? AND active = 1 ORDER BY name ASC')
        .bind(branchId)
        .all<Product>();
      return res.results;
    }
    const res = await this.db
      .prepare('SELECT * FROM products WHERE branch_id = ? ORDER BY name ASC')
      .bind(branchId)
      .all<Product>();
    return res.results;
  }

  async create(input: CreateProductInput): Promise<Product> {
    const now = new Date().toISOString();
    const active = input.active !== false ? 1 : 0;

    await this.db
      .prepare(`
        INSERT INTO products (id, branch_id, category_id, name, description, price, active, image_url, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        input.id,
        input.branch_id,
        input.category_id,
        input.name,
        input.description ?? null,
        input.price,
        active,
        input.image_url ?? null,
        now,
        now,
      )
      .run();

    const created = await this.findById(input.id);
    if (!created) {
      throw new Error(`Failed to retrieve newly created product ${input.id}`);
    }
    return created;
  }

  async listCategoriesByBranch(branchId: string, onlyActive: boolean = true): Promise<Category[]> {
    if (onlyActive) {
      const res = await this.db
        .prepare('SELECT * FROM categories WHERE branch_id = ? AND active = 1 ORDER BY sort_order ASC, name ASC')
        .bind(branchId)
        .all<Category>();
      return res.results;
    }
    const res = await this.db
      .prepare('SELECT * FROM categories WHERE branch_id = ? ORDER BY sort_order ASC, name ASC')
      .bind(branchId)
      .all<Category>();
    return res.results;
  }

  async createCategory(input: CreateCategoryInput): Promise<Category> {
    const now = new Date().toISOString();
    const active = input.active !== false ? 1 : 0;
    const sortOrder = input.sort_order ?? 0;

    await this.db
      .prepare(`
        INSERT INTO categories (id, branch_id, name, active, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(input.id, input.branch_id, input.name, active, sortOrder, now, now)
      .run();

    const created = await this.db
      .prepare('SELECT * FROM categories WHERE id = ?')
      .bind(input.id)
      .first<Category>();

    if (!created) {
      throw new Error(`Failed to retrieve newly created category ${input.id}`);
    }
    return created;
  }
}
