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

  async update(id: string, input: Partial<CreateBranchInput>): Promise<Branch> {
    const existing = await this.findById(id);
    if (!existing) throw new Error(`Branch ${id} not found`);

    const now = new Date().toISOString();
    const name = input.name ?? existing.name;
    const code = input.code ?? existing.code;
    const status = input.status ?? existing.status;
    const address = input.address !== undefined ? input.address : existing.address;
    const phone = input.phone !== undefined ? input.phone : existing.phone;
    const email = input.email !== undefined ? input.email : existing.email;
    const timezone = input.timezone ?? existing.timezone;

    await this.db
      .prepare(`
        UPDATE branches
        SET name = ?, code = ?, status = ?, address = ?, phone = ?, email = ?, timezone = ?, updated_at = ?
        WHERE id = ?
      `)
      .bind(name, code, status, address, phone, email, timezone, now, id)
      .run();

    return (await this.findById(id))!;
  }

  async updateStatus(id: string, status: BranchStatus): Promise<Branch> {
    const existing = await this.findById(id);
    if (!existing) throw new Error(`Branch ${id} not found`);

    const now = new Date().toISOString();
    await this.db
      .prepare('UPDATE branches SET status = ?, updated_at = ? WHERE id = ?')
      .bind(status, now, id)
      .run();

    return (await this.findById(id))!;
  }

  async getBranchSettings(branchId: string): Promise<BranchSettings | null> {
    return this.db
      .prepare('SELECT * FROM branch_settings WHERE branch_id = ?')
      .bind(branchId)
      .first<BranchSettings>();
  }

  async createDefaultSettings(branchId: string): Promise<BranchSettings> {
    const existing = await this.getBranchSettings(branchId);
    if (existing) return existing;

    const id = `bs_${crypto.randomUUID().replace(/-/g, '')}`;
    const now = new Date().toISOString();

    await this.db
      .prepare(`
        INSERT INTO branch_settings (
          id, branch_id, session_timeout_value, session_timeout_unit,
          order_expiry_minutes, order_edit_window_minutes, configuration_json, updated_at
        )
        VALUES (?, ?, 8, 'HOURS', 15, 60, '{}', ?)
      `)
      .bind(id, branchId, now)
      .run();

    return (await this.getBranchSettings(branchId))!;
  }

  async updateBranchSettings(
    branchId: string,
    settings: {
      session_timeout_value?: number;
      session_timeout_unit?: 'MINUTES' | 'HOURS' | 'DAYS';
      order_expiry_minutes?: number;
      order_edit_window_minutes?: number;
      configuration_json?: string;
    },
  ): Promise<BranchSettings> {
    let current = await this.getBranchSettings(branchId);
    if (!current) {
      current = await this.createDefaultSettings(branchId);
    }

    const now = new Date().toISOString();
    const timeoutVal = settings.session_timeout_value ?? current.session_timeout_value;
    const timeoutUnit = settings.session_timeout_unit ?? current.session_timeout_unit;
    const orderExp = settings.order_expiry_minutes ?? current.order_expiry_minutes;
    const orderEdit = settings.order_edit_window_minutes ?? current.order_edit_window_minutes;
    const configJson = settings.configuration_json ?? current.configuration_json;

    await this.db
      .prepare(`
        UPDATE branch_settings
        SET session_timeout_value = ?,
            session_timeout_unit = ?,
            order_expiry_minutes = ?,
            order_edit_window_minutes = ?,
            configuration_json = ?,
            updated_at = ?
        WHERE branch_id = ?
      `)
      .bind(timeoutVal, timeoutUnit, orderExp, orderEdit, configJson, now, branchId)
      .run();

    return (await this.getBranchSettings(branchId))!;
  }

  async checkBranchDependencies(branchId: string): Promise<{
    orders: number;
    payments: number;
    inventoryMovements: number;
    products: number;
    rawMaterials: number;
    activeSessions: number;
    memberships: number;
  }> {
    const ordersRow = await this.db.prepare('SELECT COUNT(*) as count FROM orders WHERE branch_id = ?').bind(branchId).first<{ count: number }>();
    const paymentsRow = await this.db.prepare('SELECT COUNT(*) as count FROM payments WHERE branch_id = ?').bind(branchId).first<{ count: number }>();
    const movementsRow = await this.db.prepare('SELECT COUNT(*) as count FROM inventory_movements WHERE branch_id = ?').bind(branchId).first<{ count: number }>();
    const productsRow = await this.db.prepare('SELECT COUNT(*) as count FROM products WHERE branch_id = ?').bind(branchId).first<{ count: number }>();
    const rawMaterialsRow = await this.db.prepare('SELECT COUNT(*) as count FROM raw_materials WHERE branch_id = ?').bind(branchId).first<{ count: number }>();
    const sessionsRow = await this.db.prepare("SELECT COUNT(*) as count FROM application_sessions WHERE branch_id = ? AND revoked_at IS NULL AND expires_at > datetime('now')").bind(branchId).first<{ count: number }>();
    const membershipsRow = await this.db.prepare('SELECT COUNT(*) as count FROM branch_memberships WHERE branch_id = ?').bind(branchId).first<{ count: number }>();

    return {
      orders: ordersRow?.count ?? 0,
      payments: paymentsRow?.count ?? 0,
      inventoryMovements: movementsRow?.count ?? 0,
      products: productsRow?.count ?? 0,
      rawMaterials: rawMaterialsRow?.count ?? 0,
      activeSessions: sessionsRow?.count ?? 0,
      memberships: membershipsRow?.count ?? 0,
    };
  }
}
