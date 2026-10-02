import { BaseRepository } from './base.repository';
import { Inventory, InventoryMovement, RawMaterial, ProductComponent } from '../../shared/types/entities.types';
import { InventoryItemType, InventoryMovementType } from '../../shared/enums/inventory.enum';
import { D1PreparedStatementLike } from '../types';

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

export interface RefillStockInput {
  branchId: string;
  productId: string;
  quantityDelta: number;
  reason?: string | null;
  actorUserId?: string | null;
}

export interface AdjustStockInput {
  branchId: string;
  productId: string;
  quantityDelta: number;
  reason: string;
  actorUserId: string;
}

export interface RefillRawMaterialInput {
  branchId: string;
  rawMaterialId: string;
  quantityDelta: number;
  reason?: string | null;
  actorUserId?: string | null;
}

export interface AdjustRawMaterialInput {
  branchId: string;
  rawMaterialId: string;
  quantityDelta: number;
  reason: string;
  actorUserId: string;
}

export interface CreateRawMaterialInput {
  id?: string;
  branch_id: string;
  name: string;
  unit: string;
  current_quantity?: number;
  reorder_threshold?: number;
}

export interface UpdateRawMaterialInput {
  name?: string;
  unit?: string;
  current_quantity?: number;
  reorder_threshold?: number;
  active?: boolean;
}

export class InventoryRepository extends BaseRepository {
  // ==========================================
  // Finished Product Inventory
  // ==========================================

  async findByProduct(branchId: string, productId: string): Promise<Inventory | null> {
    return this.db
      .prepare('SELECT * FROM inventory WHERE branch_id = ? AND product_id = ?')
      .bind(branchId, productId)
      .first<Inventory>();
  }

  async listByBranch(branchId: string): Promise<Array<Inventory & { product_name?: string }>> {
    const res = await this.db
      .prepare(`
        SELECT i.*, p.name as product_name
        FROM inventory i
        LEFT JOIN products p ON p.id = i.product_id
        WHERE i.branch_id = ?
        ORDER BY i.quantity ASC
      `)
      .bind(branchId)
      .all<Inventory & { product_name?: string }>();
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

  async refillProductStock(input: RefillStockInput): Promise<{ inventory: Inventory; movement: InventoryMovement }> {
    if (input.quantityDelta <= 0) {
      throw new Error('Refill quantity must be strictly positive');
    }

    const now = new Date().toISOString();
    const invId = `inv_${crypto.randomUUID().replace(/-/g, '')}`;
    const movId = `mov_${crypto.randomUUID().replace(/-/g, '')}`;
    const reason = input.reason?.trim() || 'Inventory Refill';

    const invStmt = this.db
      .prepare(`
        INSERT INTO inventory (id, branch_id, product_id, quantity, reorder_threshold, updated_at)
        VALUES (?, ?, ?, ?, 0, ?)
        ON CONFLICT(branch_id, product_id) DO UPDATE SET
          quantity = inventory.quantity + excluded.quantity,
          updated_at = excluded.updated_at
      `)
      .bind(invId, input.branchId, input.productId, input.quantityDelta, now);

    const movStmt = this.db
      .prepare(`
        INSERT INTO inventory_movements (
          id, branch_id, inventory_item_type, product_id, raw_material_id,
          quantity_delta, movement_type, reason, reference_type, reference_id,
          actor_user_id, created_at
        )
        VALUES (?, ?, 'FINISHED_PRODUCT', ?, NULL, ?, 'REFILL', ?, 'MANUAL', NULL, ?, ?)
      `)
      .bind(
        movId,
        input.branchId,
        input.productId,
        input.quantityDelta,
        reason,
        input.actorUserId ?? null,
        now,
      );

    await this.db.batch([invStmt, movStmt]);

    const updated = await this.findByProduct(input.branchId, input.productId);
    const movement = await this.findMovementById(movId);
    if (!updated || !movement) {
      throw new Error('Failed to retrieve updated inventory or movement after refill');
    }

    return { inventory: updated, movement };
  }

  async adjustProductStock(input: AdjustStockInput): Promise<{ inventory: Inventory; movement: InventoryMovement }> {
    if (!input.reason || input.reason.trim().length === 0) {
      throw new Error('Adjustment reason is mandatory');
    }
    if (input.quantityDelta === 0) {
      throw new Error('Adjustment quantity delta cannot be zero');
    }

    const now = new Date().toISOString();
    const movId = `mov_${crypto.randomUUID().replace(/-/g, '')}`;
    const movType = input.quantityDelta > 0
      ? InventoryMovementType.MANUAL_INCREASE
      : InventoryMovementType.MANUAL_DECREASE;

    // Guard against negative stock at the database level
    const invStmt = this.db
      .prepare(`
        UPDATE inventory
        SET quantity = quantity + ?,
            updated_at = ?
        WHERE branch_id = ?
          AND product_id = ?
          AND quantity + ? >= 0
      `)
      .bind(input.quantityDelta, now, input.branchId, input.productId, input.quantityDelta);

    const movStmt = this.db
      .prepare(`
        INSERT INTO inventory_movements (
          id, branch_id, inventory_item_type, product_id, raw_material_id,
          quantity_delta, movement_type, reason, reference_type, reference_id,
          actor_user_id, created_at
        )
        VALUES (?, ?, 'FINISHED_PRODUCT', ?, NULL, ?, ?, ?, 'MANUAL', NULL, ?, ?)
      `)
      .bind(
        movId,
        input.branchId,
        input.productId,
        input.quantityDelta,
        movType,
        input.reason.trim(),
        input.actorUserId,
        now,
      );

    const res = await this.db.batch([invStmt, movStmt]);
    const changes = Number((res[0]?.meta as { changes?: number })?.changes ?? (res[0] as { changes?: number })?.changes ?? 0);
    if (changes === 0) {
      throw new Error('Stock adjustment rejected: insufficient quantity or product not tracked in branch inventory');
    }

    const updated = await this.findByProduct(input.branchId, input.productId);
    const movement = await this.findMovementById(movId);
    if (!updated || !movement) {
      throw new Error('Failed to retrieve inventory or movement after adjustment');
    }

    return { inventory: updated, movement };
  }

  // ==========================================
  // Raw Materials
  // ==========================================

  async findRawMaterial(branchId: string, id: string): Promise<RawMaterial | null> {
    return this.db
      .prepare('SELECT * FROM raw_materials WHERE branch_id = ? AND id = ?')
      .bind(branchId, id)
      .first<RawMaterial>();
  }

  async listRawMaterials(branchId: string, onlyActive: boolean = true): Promise<RawMaterial[]> {
    if (onlyActive) {
      const res = await this.db
        .prepare('SELECT * FROM raw_materials WHERE branch_id = ? AND active = 1 ORDER BY name ASC')
        .bind(branchId)
        .all<RawMaterial>();
      return res.results;
    }
    const res = await this.db
      .prepare('SELECT * FROM raw_materials WHERE branch_id = ? ORDER BY name ASC')
      .bind(branchId)
      .all<RawMaterial>();
    return res.results;
  }

  async createRawMaterial(input: {
    id: string;
    branch_id: string;
    name: string;
    unit: string;
    current_quantity: number;
    reorder_threshold?: number;
  }): Promise<RawMaterial> {
    const now = new Date().toISOString();
    const threshold = input.reorder_threshold ?? 0;

    await this.db
      .prepare(`
        INSERT INTO raw_materials (id, branch_id, name, unit, current_quantity, reorder_threshold, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      `)
      .bind(input.id, input.branch_id, input.name, input.unit, input.current_quantity, threshold, now, now)
      .run();

    const created = await this.findRawMaterial(input.branch_id, input.id);
    if (!created) {
      throw new Error(`Failed to create raw material ${input.id}`);
    }
    return created;
  }

  async refillRawMaterialStock(input: RefillRawMaterialInput): Promise<{ rawMaterial: RawMaterial; movement: InventoryMovement }> {
    if (input.quantityDelta <= 0) {
      throw new Error('Refill quantity must be strictly positive');
    }

    const now = new Date().toISOString();
    const movId = `mov_${crypto.randomUUID().replace(/-/g, '')}`;
    const reason = input.reason?.trim() || 'Raw Material Refill';

    const matStmt = this.db
      .prepare(`
        UPDATE raw_materials
        SET current_quantity = current_quantity + ?,
            updated_at = ?
        WHERE branch_id = ? AND id = ?
      `)
      .bind(input.quantityDelta, now, input.branchId, input.rawMaterialId);

    const movStmt = this.db
      .prepare(`
        INSERT INTO inventory_movements (
          id, branch_id, inventory_item_type, product_id, raw_material_id,
          quantity_delta, movement_type, reason, reference_type, reference_id,
          actor_user_id, created_at
        )
        VALUES (?, ?, 'RAW_MATERIAL', NULL, ?, ?, 'REFILL', ?, 'MANUAL', NULL, ?, ?)
      `)
      .bind(
        movId,
        input.branchId,
        input.rawMaterialId,
        input.quantityDelta,
        reason,
        input.actorUserId ?? null,
        now,
      );

    const res = await this.db.batch([matStmt, movStmt]);
    const changes = Number((res[0]?.meta as { changes?: number })?.changes ?? (res[0] as { changes?: number })?.changes ?? 0);
    if (changes === 0) {
      throw new Error(`Raw material ${input.rawMaterialId} not found in branch`);
    }

    const updated = await this.findRawMaterial(input.branchId, input.rawMaterialId);
    const movement = await this.findMovementById(movId);
    if (!updated || !movement) {
      throw new Error('Failed to retrieve raw material or movement after refill');
    }

    return { rawMaterial: updated, movement };
  }

  async adjustRawMaterialStock(input: AdjustRawMaterialInput): Promise<{ rawMaterial: RawMaterial; movement: InventoryMovement }> {
    if (!input.reason || input.reason.trim().length === 0) {
      throw new Error('Adjustment reason is mandatory');
    }
    if (input.quantityDelta === 0) {
      throw new Error('Adjustment quantity delta cannot be zero');
    }

    const now = new Date().toISOString();
    const movId = `mov_${crypto.randomUUID().replace(/-/g, '')}`;
    const movType = input.quantityDelta > 0
      ? InventoryMovementType.MANUAL_INCREASE
      : InventoryMovementType.MANUAL_DECREASE;

    const matStmt = this.db
      .prepare(`
        UPDATE raw_materials
        SET current_quantity = current_quantity + ?,
            updated_at = ?
        WHERE branch_id = ?
          AND id = ?
          AND current_quantity + ? >= 0
      `)
      .bind(input.quantityDelta, now, input.branchId, input.rawMaterialId, input.quantityDelta);

    const movStmt = this.db
      .prepare(`
        INSERT INTO inventory_movements (
          id, branch_id, inventory_item_type, product_id, raw_material_id,
          quantity_delta, movement_type, reason, reference_type, reference_id,
          actor_user_id, created_at
        )
        VALUES (?, ?, 'RAW_MATERIAL', NULL, ?, ?, ?, ?, 'MANUAL', NULL, ?, ?)
      `)
      .bind(
        movId,
        input.branchId,
        input.rawMaterialId,
        input.quantityDelta,
        movType,
        input.reason.trim(),
        input.actorUserId,
        now,
      );

    const res = await this.db.batch([matStmt, movStmt]);
    const changes = Number((res[0]?.meta as { changes?: number })?.changes ?? (res[0] as { changes?: number })?.changes ?? 0);
    if (changes === 0) {
      throw new Error('Raw material adjustment rejected: insufficient quantity or material not found');
    }

    const updated = await this.findRawMaterial(input.branchId, input.rawMaterialId);
    const movement = await this.findMovementById(movId);
    if (!updated || !movement) {
      throw new Error('Failed to retrieve raw material or movement after adjustment');
    }

    return { rawMaterial: updated, movement };
  }

  // ==========================================
  // Product BOM / Recipes
  // ==========================================

  async findProductById(productId: string): Promise<{ id: string; branch_id: string; name: string; active: number } | null> {
    return this.db
      .prepare('SELECT id, branch_id, name, active FROM products WHERE id = ?')
      .bind(productId)
      .first<{ id: string; branch_id: string; name: string; active: number }>();
  }

  async listComponentsByProduct(productId: string): Promise<ProductComponent[]> {
    const res = await this.db
      .prepare('SELECT * FROM product_components WHERE product_id = ?')
      .bind(productId)
      .all<ProductComponent>();
    return res.results;
  }

  async listComponentsByBranch(branchId: string): Promise<Array<ProductComponent & { product_name: string; raw_material_name: string }>> {
    const res = await this.db
      .prepare(`
        SELECT pc.*, p.name as product_name, rm.name as raw_material_name
        FROM product_components pc
        JOIN products p ON p.id = pc.product_id
        JOIN raw_materials rm ON rm.id = pc.raw_material_id
        WHERE p.branch_id = ?
        ORDER BY p.name ASC, rm.name ASC
      `)
      .bind(branchId)
      .all<ProductComponent & { product_name: string; raw_material_name: string }>();
    return res.results;
  }

  async setProductComponents(
    productId: string,
    components: Array<{ id: string; raw_material_id: string; quantity_required: number; unit: string }>,
  ): Promise<ProductComponent[]> {
    const deleteStmt = this.db
      .prepare('DELETE FROM product_components WHERE product_id = ?')
      .bind(productId);

    const insertStmts = components.map((c) =>
      this.db
        .prepare(`
          INSERT INTO product_components (id, product_id, raw_material_id, quantity_required, unit)
          VALUES (?, ?, ?, ?, ?)
        `)
        .bind(c.id, productId, c.raw_material_id, c.quantity_required, c.unit),
    );

    await this.db.batch([deleteStmt, ...insertStmts]);
    return this.listComponentsByProduct(productId);
  }

  // ==========================================
  // Low Stock Detection
  // ==========================================

  async getLowStockProducts(branchId: string): Promise<Array<Inventory & { product_name: string }>> {
    const res = await this.db
      .prepare(`
        SELECT i.*, p.name as product_name
        FROM inventory i
        JOIN products p ON p.id = i.product_id
        WHERE i.branch_id = ?
          AND i.quantity <= i.reorder_threshold
        ORDER BY i.quantity ASC
      `)
      .bind(branchId)
      .all<Inventory & { product_name: string }>();
    return res.results;
  }

  async getLowStockRawMaterials(branchId: string): Promise<RawMaterial[]> {
    const res = await this.db
      .prepare(`
        SELECT *
        FROM raw_materials
        WHERE branch_id = ?
          AND active = 1
          AND current_quantity <= reorder_threshold
        ORDER BY current_quantity ASC
      `)
      .bind(branchId)
      .all<RawMaterial>();
    return res.results;
  }

  // ==========================================
  // Movement Ledger
  // ==========================================

  async findMovementById(id: string): Promise<InventoryMovement | null> {
    return this.db
      .prepare('SELECT * FROM inventory_movements WHERE id = ?')
      .bind(id)
      .first<InventoryMovement>();
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

    const created = await this.findMovementById(input.id);
    if (!created) {
      throw new Error(`Failed to retrieve movement record ${input.id}`);
    }
    return created;
  }

  async listMovements(
    branchId: string,
    limit: number = 50,
  ): Promise<Array<InventoryMovement & { product_name?: string; raw_material_name?: string }>> {
    const res = await this.db
      .prepare(`
        SELECT m.*, p.name as product_name, rm.name as raw_material_name
        FROM inventory_movements m
        LEFT JOIN products p ON p.id = m.product_id
        LEFT JOIN raw_materials rm ON rm.id = m.raw_material_id
        WHERE m.branch_id = ?
        ORDER BY m.created_at DESC
        LIMIT ?
      `)
      .bind(branchId, limit)
      .all<InventoryMovement & { product_name?: string; raw_material_name?: string }>();
    return res.results;
  }

  async findRawMaterialById(id: string): Promise<RawMaterial | null> {
    return this.db
      .prepare('SELECT * FROM raw_materials WHERE id = ?')
      .bind(id)
      .first<RawMaterial>();
  }

  async updateRawMaterial(
    id: string,
    updates: UpdateRawMaterialInput,
  ): Promise<RawMaterial> {
    const existing = await this.findRawMaterialById(id);
    if (!existing) throw new Error(`Raw material ${id} not found`);

    const name = updates.name ?? existing.name;
    const unit = updates.unit ?? existing.unit;
    const currentQty = updates.current_quantity !== undefined ? updates.current_quantity : existing.current_quantity;
    const threshold = updates.reorder_threshold !== undefined ? updates.reorder_threshold : existing.reorder_threshold;
    const active = updates.active !== undefined ? (updates.active ? 1 : 0) : (existing.active ? 1 : 0);
    const now = new Date().toISOString();

    await this.db
      .prepare(`
        UPDATE raw_materials
        SET name = ?, unit = ?, current_quantity = ?, reorder_threshold = ?, active = ?, updated_at = ?
        WHERE id = ?
      `)
      .bind(name, unit, currentQty, threshold, active, now, id)
      .run();

    return (await this.findRawMaterialById(id))!;
  }

  prepareDeductProductStockStatement(
    branchId: string,
    productId: string,
    quantity: number,
    nowIso: string,
  ): D1PreparedStatementLike {
    return this.db
      .prepare(`
        UPDATE inventory
        SET quantity = quantity - ?,
            updated_at = ?
        WHERE branch_id = ?
          AND product_id = ?
          AND quantity >= ?
      `)
      .bind(quantity, nowIso, branchId, productId, quantity);
  }

  prepareAddProductStockStatement(
    branchId: string,
    productId: string,
    quantity: number,
    nowIso: string,
  ): D1PreparedStatementLike {
    return this.db
      .prepare(`
        INSERT INTO inventory (id, branch_id, product_id, quantity, reorder_threshold, updated_at)
        VALUES (?, ?, ?, ?, 0, ?)
        ON CONFLICT(branch_id, product_id) DO UPDATE SET
          quantity = inventory.quantity + excluded.quantity,
          updated_at = excluded.updated_at
      `)
      .bind(`inv_${crypto.randomUUID().replace(/-/g, '')}`, branchId, productId, quantity, nowIso);
  }

  prepareDeductRawMaterialStockStatement(
    rawMaterialId: string,
    quantity: number,
    nowIso: string,
  ): D1PreparedStatementLike {
    return this.db
      .prepare(`
        UPDATE raw_materials
        SET current_quantity = current_quantity - ?,
            updated_at = ?
        WHERE id = ?
          AND current_quantity >= ?
      `)
      .bind(quantity, nowIso, rawMaterialId, quantity);
  }

  prepareAddRawMaterialStockStatement(
    rawMaterialId: string,
    quantity: number,
    nowIso: string,
  ): D1PreparedStatementLike {
    return this.db
      .prepare(`
        UPDATE raw_materials
        SET current_quantity = current_quantity + ?,
            updated_at = ?
        WHERE id = ?
      `)
      .bind(quantity, nowIso, rawMaterialId);
  }

  prepareCreateMovementStatement(input: {
    branch_id: string;
    inventory_item_type?: InventoryItemType;
    product_id: string | null;
    raw_material_id: string | null;
    quantity_delta: number;
    movement_type: InventoryMovementType;
    reason: string;
    reference_type?: string | null;
    reference_id?: string | null;
    actor_user_id?: string | null;
    created_at: string;
  }): D1PreparedStatementLike {
    const itemType = input.inventory_item_type ?? (input.product_id ? 'FINISHED_PRODUCT' : 'RAW_MATERIAL');
    const movId = `mov_${crypto.randomUUID().replace(/-/g, '')}`;
    return this.db
      .prepare(`
        INSERT INTO inventory_movements (
          id, branch_id, inventory_item_type, product_id, raw_material_id,
          quantity_delta, movement_type, reason, reference_type, reference_id,
          actor_user_id, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        movId,
        input.branch_id,
        itemType,
        input.product_id ?? null,
        input.raw_material_id ?? null,
        input.quantity_delta,
        input.movement_type,
        input.reason,
        input.reference_type ?? null,
        input.reference_id ?? null,
        input.actor_user_id ?? null,
        input.created_at,
      );
  }
}
