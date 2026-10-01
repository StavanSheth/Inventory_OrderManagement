import { BaseRepository } from './base.repository';
import { Branch, BranchSettings } from '../../shared/types/entities.types';
import { BranchStatus } from '../../shared/enums/branch.enum';

export interface CreateBranchInput {
  id: string;
  name: string;
  code: string;
  status?: BranchStatus;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  timezone?: string;
}

export class BranchRepository extends BaseRepository {
  async findById(id: string): Promise<Branch | null> {
    return this.db
      .prepare('SELECT * FROM branches WHERE id = ?')
      .bind(id)
      .first<Branch>();
  }

  async findByCode(code: string): Promise<Branch | null> {
    return this.db
      .prepare('SELECT * FROM branches WHERE code = ?')
      .bind(code)
      .first<Branch>();
  }

  async listAll(status?: BranchStatus): Promise<Branch[]> {
    if (status) {
      const res = await this.db
        .prepare('SELECT * FROM branches WHERE status = ? ORDER BY name ASC')
        .bind(status)
        .all<Branch>();
      return res.results;
    }
    const res = await this.db
      .prepare('SELECT * FROM branches ORDER BY name ASC')
      .all<Branch>();
    return res.results;
  }

  async create(input: CreateBranchInput): Promise<Branch> {
    const now = new Date().toISOString();
    const status = input.status ?? BranchStatus.ACTIVE;
    const timezone = input.timezone ?? 'UTC';

    await this.db
      .prepare(`
        INSERT INTO branches (id, name, code, status, address, phone, email, timezone, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        input.id,
        input.name,
        input.code,
        status,
        input.address ?? null,
        input.phone ?? null,
        input.email ?? null,
        timezone,
        now,
        now,
      )
      .run();

    const created = await this.findById(input.id);
    if (!created) {
      throw new Error(`Failed to retrieve newly created branch ${input.id}`);
    }
    return created;
  }

  async getBranchSettings(branchId: string): Promise<BranchSettings | null> {
    return this.db
      .prepare('SELECT * FROM branch_settings WHERE branch_id = ?')
      .bind(branchId)
      .first<BranchSettings>();
  }
}
