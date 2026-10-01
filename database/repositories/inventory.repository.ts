import { BaseRepository } from './base.repository';
import { Inventory, InventoryMovement } from '../../shared/types/entities.types';
import { InventoryItemType, InventoryMovementType } from '../../shared/enums/inventory.enum';

export interface SetInventoryInput {
  id: string;
  branch_id: string;
  product_id: string;
  quantity: number;
  reorder_threshold?: number;
}

export interface RecordMovementInput {
  id: string;
  branch_id: string;
  inventory_item_type: InventoryItemType;
  product_id?: string | null;
  raw_material_id?: string | null;
  quantity_delta: number;
  movement_type: InventoryMovementType;
  reason?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
  actor_user_id?: string | null;
}

export class InventoryRepository extends BaseRepository {
  async findByProduct(branchId: string, productId: string): Promise<Inventory | null> {
    return this.db
      .prepare('SELECT * FROM inventory WHERE branch_id = ? AND product_id = ?')
      .bind(branchId, productId)
      .first<Inventory>();
  }

  async listByBranch(branchId: string): Promise<Inventory[]> {
    const res = await this.db
      .prepare('SELECT * FROM inventory WHERE branch_id = ? ORDER BY quantity ASC')
      .bind(branchId)
      .all<Inventory>();
    return res.results;
  }

  async upsertStock(input: SetInventoryInput): Promise<Inventory> {
    const now = new Date().toISOString();
    const threshold = input.reorder_threshold ?? 0;

    await this.db
      .prepare(`
        INSERT INTO inventory (id, branch_id, product_id, quantity, reorder_threshold, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(branch_id, product_id) DO UPDATE SET
          quantity = excluded.quantity,
          reorder_threshold = excluded.reorder_threshold,
          updated_at = excluded.updated_at
      `)
      .bind(input.id, input.branch_id, input.product_id, input.quantity, threshold, now)
      .run();

    const updated = await this.findByProduct(input.branch_id, input.product_id);
    if (!updated) {
      throw new Error(`Failed to retrieve inventory for branch ${input.branch_id} product ${input.product_id}`);
    }
    return updated;
  }

  async recordMovement(input: RecordMovementInput): Promise<InventoryMovement> {
    const now = new Date().toISOString();

    await this.db
      .prepare(`
        INSERT INTO inventory_movements (
          id, branch_id, inventory_item_type, product_id, raw_material_id,
          quantity_delta, movement_type, reason, reference_type, reference_id,
          actor_user_id, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        input.id,
        input.branch_id,
        input.inventory_item_type,
        input.product_id ?? null,
        input.raw_material_id ?? null,
        input.quantity_delta,
        input.movement_type,
        input.reason ?? null,
        input.reference_type ?? null,
        input.reference_id ?? null,
        input.actor_user_id ?? null,
        now,
      )
      .run();

    const created = await this.db
      .prepare('SELECT * FROM inventory_movements WHERE id = ?')
      .bind(input.id)
      .first<InventoryMovement>();

    if (!created) {
      throw new Error(`Failed to retrieve movement record ${input.id}`);
    }
    return created;
  }

  async listMovements(branchId: string, limit: number = 50): Promise<InventoryMovement[]> {
    const res = await this.db
      .prepare('SELECT * FROM inventory_movements WHERE branch_id = ? ORDER BY created_at DESC LIMIT ?')
      .bind(branchId, limit)
      .all<InventoryMovement>();
    return res.results;
  }
}
