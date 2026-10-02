import { Inventory, InventoryMovement, RawMaterial, ProductComponent } from '../../../shared/types/entities.types';
import { InventoryMovementType, InventoryItemType } from '../../../shared/enums/inventory.enum';
import { AuditAction } from '../../../shared/enums/audit.enum';
import { InventoryRepository, CreateRawMaterialInput, UpdateRawMaterialInput } from '../../../database/repositories/inventory.repository';
import { AuditRepository } from '../../../database/repositories/audit.repository';
import { D1PreparedStatementLike } from '../../../database/types';
import { BadRequestError, NotFoundError, ForbiddenError } from '../../errors/app-error';

export interface BOMRequirement {
  rawMaterialId: string;
  rawMaterialName: string;
  unit: string;
  totalQuantityRequired: number;
}

export interface StockValidationResult {
  isAvailable: boolean;
  insufficientProducts: Array<{ productId: string; requested: number; available: number }>;
  insufficientMaterials: Array<{ rawMaterialId: string; name: string; requested: number; available: number }>;
  errorMessage?: string;
}

export interface LowStockReport {
  products: Inventory[];
  rawMaterials: RawMaterial[];
}

export interface IInventoryService {
  // Finished product stock
  getStock(branchId: string, productId: string): Promise<Inventory | null>;
  listBranchStock(branchId: string): Promise<Inventory[]>;
  refillProductStock(branchId: string, productId: string, quantity: number, actorUserId: string, reason?: string): Promise<Inventory>;
  adjustProductStock(branchId: string, productId: string, delta: number, actorUserId: string, reason: string): Promise<Inventory>;
  updatePricingAndTaxes(
    branchId: string,
    productId: string,
    pricing: {
      selling_price?: number;
      tax_rate?: number;
      cgst_rate?: number;
      sgst_rate?: number;
      igst_rate?: number;
    },
    actorUserId?: string,
  ): Promise<Inventory>;

  // Raw materials
  listRawMaterials(branchId: string, onlyActive?: boolean): Promise<RawMaterial[]>;
  getRawMaterialById(materialId: string): Promise<RawMaterial | null>;
  createRawMaterial(branchId: string, actorUserId: string, input: Omit<CreateRawMaterialInput, 'branch_id'>): Promise<RawMaterial>;
  updateRawMaterial(materialId: string, branchId: string, actorUserId: string, input: UpdateRawMaterialInput): Promise<RawMaterial>;
  refillRawMaterialStock(materialId: string, quantity: number, actorUserId: string, reason?: string): Promise<RawMaterial>;
  adjustRawMaterialStock(materialId: string, delta: number, actorUserId: string, reason: string): Promise<RawMaterial>;

  // BOM / Recipes
  getProductComponents(productId: string, branchId?: string): Promise<ProductComponent[]>;
  setProductComponents(productId: string, components: Array<{ rawMaterialId: string; quantityRequired: number }>, actorUserId: string, branchId?: string): Promise<ProductComponent[]>;
  calculateBOMRequirements(branchId: string, items: Array<{ productId: string; quantity: number }>): Promise<BOMRequirement[]>;

  // Low stock
  getLowStock(branchId: string): Promise<LowStockReport>;

  // Validation
  validateStockAvailability(branchId: string, items: Array<{ productId: string; quantity: number }>): Promise<StockValidationResult>;

  // Movements ledger
  getMovements(branchId: string, limit?: number): Promise<InventoryMovement[]>;

  // Statements for transactions
  prepareOrderConfirmationStatements(opts: {
    branchId: string;
    orderId: string;
    actorUserId: string;
    items: Array<{ productId: string; quantity: number }>;
  }): Promise<D1PreparedStatementLike[]>;

  prepareOrderEditDeltaStatements(opts: {
    branchId: string;
    orderId: string;
    actorUserId: string;
    oldItems: Array<{ productId: string; quantity: number }>;
    newItems: Array<{ productId: string; quantity: number }>;
    allowPositiveConsumption?: boolean;
  }): Promise<D1PreparedStatementLike[]>;

  finalizePendingOrderInventory(opts: {
    branchId: string;
    orderId: string;
    actorUserId: string;
    items: Array<{ productId: string; quantity: number }>;
  }): Promise<void>;

  prepareFinalizePendingOrderInventoryStatements(opts: {
    branchId: string;
    orderId: string;
    actorUserId: string;
    items: Array<{ productId: string; quantity: number }>;
  }): Promise<{
    statements: D1PreparedStatementLike[];
    pendingDeltas: Array<{ productId: string; quantity: number }>;
  }>;

  prepareOrderCancellationRestockStatements(opts: {
    branchId: string;
    orderId: string;
    actorUserId?: string | null;
    items: Array<{ productId: string; quantity: number }>;
    nowIso?: string;
  }): D1PreparedStatementLike[];
}

export const INVENTORY_SERVICE_TOKEN = 'IInventoryService';

export class InventoryService implements IInventoryService {
  constructor(
    private inventoryRepo: InventoryRepository,
    private auditRepo?: AuditRepository,
  ) {}

  // ==========================================
  // Finished Products
  // ==========================================

  async getStock(branchId: string, productId: string): Promise<Inventory | null> {
    return this.inventoryRepo.findByProduct(branchId, productId);
  }

  async listBranchStock(branchId: string): Promise<Inventory[]> {
    return this.inventoryRepo.listByBranch(branchId);
  }

  async updatePricingAndTaxes(
    branchId: string,
    productId: string,
    pricing: {
      selling_price?: number;
      tax_rate?: number;
      cgst_rate?: number;
      sgst_rate?: number;
      igst_rate?: number;
      serving_size?: string;
      price_rate?: number;
      serving_sizes_json?: string;
    },
    actorUserId?: string,
  ): Promise<Inventory> {
    const updated = await this.inventoryRepo.updatePricingAndTaxes(branchId, productId, pricing);
    if (this.auditRepo && actorUserId) {
      await this.auditRepo
        .log({
          actor_user_id: actorUserId,
          action: AuditAction.INVENTORY_ADJUSTED,
          entity_type: 'inventory',
          entity_id: updated.id,
          branch_id: branchId,
          metadata: {
            productId,
            pricing,
          },
        })
        .catch(() => {});
    }
    return updated;
  }

  async refillProductStock(
    branchId: string,
    productId: string,
    quantity: number,
    actorUserId: string,
    reason: string = 'Stock refill',
  ): Promise<Inventory> {
    if (!quantity || quantity <= 0) {
      throw new BadRequestError('Refill quantity must be a positive number');
    }

    const result = await this.inventoryRepo.refillProductStock({
      branchId,
      productId,
      quantityDelta: quantity,
      actorUserId,
      reason,
    });

    await this.auditRepo?.log({
      branch_id: branchId,
      actor_user_id: actorUserId,
      action: AuditAction.INVENTORY_REFILLED,
      entity_type: 'inventory',
      entity_id: result.inventory.id,
      metadata: { productId, quantityAdded: quantity, newStock: result.inventory.quantity, reason },
    });

    return result.inventory;
  }

  async adjustProductStock(
    branchId: string,
    productId: string,
    delta: number,
    actorUserId: string,
    reason: string,
  ): Promise<Inventory> {
    if (!reason || !reason.trim()) {
      throw new BadRequestError('Adjustment reason is strictly mandatory for manual stock changes');
    }
    if (delta === 0) {
      throw new BadRequestError('Adjustment delta cannot be zero');
    }

    const inv = await this.inventoryRepo.findByProduct(branchId, productId);
    if (inv && inv.quantity + delta < 0) {
      throw new BadRequestError(`Cannot adjust product stock: resulting stock would be negative (${inv.quantity + delta})`);
    }

    const result = await this.inventoryRepo.adjustProductStock({
      branchId,
      productId,
      quantityDelta: delta,
      actorUserId,
      reason: reason.trim(),
    });

    await this.auditRepo?.log({
      branch_id: branchId,
      actor_user_id: actorUserId,
      action: AuditAction.INVENTORY_ADJUSTED,
      entity_type: 'inventory',
      entity_id: result.inventory.id,
      metadata: { productId, delta, newStock: result.inventory.quantity, reason: reason.trim() },
    });

    return result.inventory;
  }

  // ==========================================
  // Raw Materials
  // ==========================================

  async listRawMaterials(branchId: string, onlyActive: boolean = true): Promise<RawMaterial[]> {
    return this.inventoryRepo.listRawMaterials(branchId, onlyActive);
  }

  async getRawMaterialById(materialId: string): Promise<RawMaterial | null> {
    return this.inventoryRepo.findRawMaterialById(materialId);
  }

  async createRawMaterial(
    branchId: string,
    actorUserId: string,
    input: Omit<CreateRawMaterialInput, 'branch_id'>,
  ): Promise<RawMaterial> {
    if (!input.name || !input.name.trim()) {
      throw new BadRequestError('Raw material name is required');
    }
    if (!input.unit || !input.unit.trim()) {
      throw new BadRequestError('Raw material unit (e.g. kg, L) is required');
    }

    const id = `rm_${crypto.randomUUID().replace(/-/g, '')}`;
    const created = await this.inventoryRepo.createRawMaterial({
      id,
      branch_id: branchId,
      name: input.name,
      unit: input.unit,
      current_quantity: input.current_quantity ?? 0,
      reorder_threshold: input.reorder_threshold ?? 0,
      actor_user_id: actorUserId,
    });

    await this.auditRepo?.log({
      branch_id: branchId,
      actor_user_id: actorUserId,
      action: (created.current_quantity > 0) ? AuditAction.INVENTORY_REFILLED : AuditAction.INVENTORY_ADJUSTED,
      entity_type: 'raw_material',
      entity_id: created.id,
      metadata: { name: created.name, unit: created.unit, initialQuantity: created.current_quantity },
    });

    return created;
  }

  async updateRawMaterial(
    materialId: string,
    branchId: string,
    actorUserId: string,
    input: UpdateRawMaterialInput,
  ): Promise<RawMaterial> {
    const existing = await this.inventoryRepo.findRawMaterialById(materialId);
    if (!existing) throw new NotFoundError(`Raw material ${materialId} not found`);
    if (existing.branch_id !== branchId) {
      throw new ForbiddenError('Cannot modify raw material of another branch');
    }

    const updated = await this.inventoryRepo.updateRawMaterial(materialId, input);

    await this.auditRepo?.log({
      branch_id: branchId,
      actor_user_id: actorUserId,
      action: AuditAction.INVENTORY_ADJUSTED,
      entity_type: 'raw_material',
      entity_id: materialId,
      metadata: { updates: input },
    });

    return updated;
  }

  async refillRawMaterialStock(
    materialId: string,
    quantity: number,
    actorUserId: string,
    reason: string = 'Raw material refill',
  ): Promise<RawMaterial> {
    if (!quantity || quantity <= 0) {
      throw new BadRequestError('Refill quantity must be a positive number');
    }

    const existing = await this.inventoryRepo.findRawMaterialById(materialId);
    if (!existing) throw new NotFoundError(`Raw material ${materialId} not found`);

    const result = await this.inventoryRepo.refillRawMaterialStock({
      branchId: existing.branch_id,
      rawMaterialId: materialId,
      quantityDelta: quantity,
      actorUserId,
      reason,
    });

    await this.auditRepo?.log({
      branch_id: result.rawMaterial.branch_id,
      actor_user_id: actorUserId,
      action: AuditAction.INVENTORY_REFILLED,
      entity_type: 'raw_material',
      entity_id: materialId,
      metadata: { quantityAdded: quantity, newStock: result.rawMaterial.current_quantity, reason },
    });

    return result.rawMaterial;
  }

  async adjustRawMaterialStock(
    materialId: string,
    delta: number,
    actorUserId: string,
    reason: string,
  ): Promise<RawMaterial> {
    if (!reason || !reason.trim()) {
      throw new BadRequestError('Adjustment reason is strictly mandatory for raw material stock changes');
    }
    if (delta === 0) {
      throw new BadRequestError('Adjustment delta cannot be zero');
    }

    const existing = await this.inventoryRepo.findRawMaterialById(materialId);
    if (!existing) throw new NotFoundError(`Raw material ${materialId} not found`);

    if (existing.current_quantity + delta < 0) {
      throw new BadRequestError(`Cannot adjust raw material: resulting stock would be negative (${existing.current_quantity + delta})`);
    }

    const result = await this.inventoryRepo.adjustRawMaterialStock({
      branchId: existing.branch_id,
      rawMaterialId: materialId,
      quantityDelta: delta,
      actorUserId,
      reason: reason.trim(),
    });

    await this.auditRepo?.log({
      branch_id: result.rawMaterial.branch_id,
      actor_user_id: actorUserId,
      action: AuditAction.INVENTORY_ADJUSTED,
      entity_type: 'raw_material',
      entity_id: materialId,
      metadata: { delta, newStock: result.rawMaterial.current_quantity, reason: reason.trim() },
    });

    return result.rawMaterial;
  }

  // ==========================================
  // Product BOM / Recipes
  // ==========================================

  async getProductComponents(productId: string, branchId?: string): Promise<ProductComponent[]> {
    if (branchId) {
      const product = await this.inventoryRepo.findProductById(productId);
      if (!product) {
        throw new NotFoundError(`Product ${productId} not found`);
      }
      if (product.branch_id !== branchId) {
        throw new ForbiddenError('Product belongs to a different branch');
      }
    }
    return this.inventoryRepo.listComponentsByProduct(productId);
  }

  async setProductComponents(
    productId: string,
    components: Array<{ rawMaterialId: string; quantityRequired: number }>,
    actorUserId: string,
    branchId?: string,
  ): Promise<ProductComponent[]> {
    const product = await this.inventoryRepo.findProductById(productId);
    if (!product) {
      throw new NotFoundError(`Product ${productId} not found`);
    }
    if (branchId && product.branch_id !== branchId) {
      throw new ForbiddenError('Product belongs to a different branch');
    }

    const seenMaterials = new Set<string>();
    const formatted = [];
    for (const c of components) {
      if (!c.quantityRequired || c.quantityRequired <= 0 || !Number.isFinite(c.quantityRequired)) {
        throw new BadRequestError(`Component quantity requirement must be a positive number`);
      }
      if (seenMaterials.has(c.rawMaterialId)) {
        throw new BadRequestError(`Duplicate raw material component ${c.rawMaterialId} in recipe`);
      }
      seenMaterials.add(c.rawMaterialId);

      const mat = await this.inventoryRepo.findRawMaterialById(c.rawMaterialId);
      if (!mat) {
        throw new NotFoundError(`Raw material ${c.rawMaterialId} not found`);
      }
      if (!mat.active) {
        throw new BadRequestError(`Cannot use inactive raw material "${mat.name}" in recipe`);
      }
      if (mat.branch_id !== product.branch_id) {
        throw new BadRequestError(`Raw material "${mat.name}" belongs to a different branch`);
      }

      formatted.push({
        id: `pc_${crypto.randomUUID().replace(/-/g, '')}`,
        raw_material_id: c.rawMaterialId,
        quantity_required: c.quantityRequired,
        unit: mat.unit,
      });
    }

    const res = await this.inventoryRepo.setProductComponents(productId, formatted);

    await this.auditRepo?.log({
      branch_id: product.branch_id,
      actor_user_id: actorUserId,
      action: AuditAction.INVENTORY_ADJUSTED,
      entity_type: 'product_components',
      entity_id: productId,
      metadata: { componentCount: components.length, branchId: product.branch_id },
    });

    return res;
  }

  async calculateBOMRequirements(
    branchId: string,
    items: Array<{ productId: string; quantity: number }>,
  ): Promise<BOMRequirement[]> {
    const branchComponents = await this.inventoryRepo.listComponentsByBranch(branchId);
    const rawMaterials = await this.inventoryRepo.listRawMaterials(branchId, false);
    const materialsMap = new Map(rawMaterials.map((m) => [m.id, m]));

    // Group components by product_id
    const componentsByProduct = new Map<string, ProductComponent[]>();
    for (const comp of branchComponents) {
      const list = componentsByProduct.get(comp.product_id) ?? [];
      list.push(comp);
      componentsByProduct.set(comp.product_id, list);
    }

    // Accumulate required raw materials using deterministic arithmetic
    const requiredMap = new Map<string, number>();

    for (const item of items) {
      const comps = componentsByProduct.get(item.productId) ?? [];
      for (const comp of comps) {
        const currentReq = requiredMap.get(comp.raw_material_id) ?? 0;
        const addReq = comp.quantity_required * item.quantity;
        requiredMap.set(comp.raw_material_id, Math.round((currentReq + addReq) * 1000) / 1000);
      }
    }

    const result: BOMRequirement[] = [];
    for (const [matId, totalQty] of requiredMap.entries()) {
      const mat = materialsMap.get(matId);
      result.push({
        rawMaterialId: matId,
        rawMaterialName: mat?.name ?? 'Unknown Material',
        unit: mat?.unit ?? 'units',
        totalQuantityRequired: totalQty,
      });
    }

    return result;
  }

  // ==========================================
  // Low Stock
  // ==========================================

  async getLowStock(branchId: string): Promise<LowStockReport> {
    const [products, rawMaterials] = await Promise.all([
      this.inventoryRepo.getLowStockProducts(branchId),
      this.inventoryRepo.getLowStockRawMaterials(branchId),
    ]);
    return { products, rawMaterials };
  }

  // ==========================================
  // Stock Validation
  // ==========================================

  async validateStockAvailability(
    branchId: string,
    items: Array<{ productId: string; quantity: number }>,
  ): Promise<StockValidationResult> {
    const insufficientProducts: Array<{ productId: string; requested: number; available: number }> = [];
    const insufficientMaterials: Array<{ rawMaterialId: string; name: string; requested: number; available: number }> = [];

    // 1. Check finished products (for tracked products)
    for (const item of items) {
      const inv = await this.inventoryRepo.findByProduct(branchId, item.productId);
      if (inv !== null) {
        const available = inv.quantity ?? 0;
        if (available < item.quantity) {
          insufficientProducts.push({
            productId: item.productId,
            requested: item.quantity,
            available,
          });
        }
      }
    }

    // 2. Check BOM raw materials
    const bomReqs = await this.calculateBOMRequirements(branchId, items);
    for (const req of bomReqs) {
      const mat = await this.inventoryRepo.findRawMaterialById(req.rawMaterialId);
      const available = mat?.current_quantity ?? 0;
      if (available < req.totalQuantityRequired) {
        insufficientMaterials.push({
          rawMaterialId: req.rawMaterialId,
          name: req.rawMaterialName,
          requested: req.totalQuantityRequired,
          available,
        });
      }
    }

    const isAvailable = insufficientProducts.length === 0 && insufficientMaterials.length === 0;
    let errorMessage: string | undefined;

    if (!isAvailable) {
      const productErrors = insufficientProducts.map((p) => `Product ${p.productId} (requested: ${p.requested}, available: ${p.available})`);
      const materialErrors = insufficientMaterials.map((m) => `Raw material "${m.name}" (requested: ${m.requested}, available: ${m.available})`);
      errorMessage = `Insufficient inventory: ${[...productErrors, ...materialErrors].join('; ')}`;
    }

    return {
      isAvailable,
      insufficientProducts,
      insufficientMaterials,
      errorMessage,
    };
  }

  // ==========================================
  // Ledger
  // ==========================================

  async getMovements(branchId: string, limit: number = 50): Promise<InventoryMovement[]> {
    return this.inventoryRepo.listMovements(branchId, limit);
  }

  // ==========================================
  // Statements for Order Confirmation & Edit
  // ==========================================

  async prepareOrderConfirmationStatements(opts: {
    branchId: string;
    orderId: string;
    actorUserId: string;
    items: Array<{ productId: string; quantity: number }>;
  }): Promise<D1PreparedStatementLike[]> {
    const now = new Date().toISOString();
    const stmts: D1PreparedStatementLike[] = [];

    // 1. Finished product deductions & movements
    for (const item of opts.items) {
      const inv = await this.inventoryRepo.findByProduct(opts.branchId, item.productId);
      if (inv !== null) {
        const deductStmt = this.inventoryRepo.prepareDeductProductStockStatement(
          opts.branchId,
          item.productId,
          item.quantity,
          now,
        );
        const moveStmt = this.inventoryRepo.prepareCreateMovementStatement({
          branch_id: opts.branchId,
          product_id: item.productId,
          raw_material_id: null,
          movement_type: InventoryMovementType.ORDER_CONSUMPTION,
          quantity_delta: -item.quantity,
          reason: 'Order confirmation stock deduction',
          reference_type: 'ORDER',
          reference_id: opts.orderId,
          actor_user_id: opts.actorUserId,
          created_at: now,
        });
        stmts.push(deductStmt, moveStmt);
      }
    }

    // 2. BOM raw material deductions & movements
    const bomReqs = await this.calculateBOMRequirements(opts.branchId, opts.items);
    for (const req of bomReqs) {
      const deductStmt = this.inventoryRepo.prepareDeductRawMaterialStockStatement(
        req.rawMaterialId,
        req.totalQuantityRequired,
        now,
      );
      const moveStmt = this.inventoryRepo.prepareCreateMovementStatement({
        branch_id: opts.branchId,
        product_id: null,
        raw_material_id: req.rawMaterialId,
        movement_type: InventoryMovementType.ORDER_CONSUMPTION,
        quantity_delta: -req.totalQuantityRequired,
        reason: `Order confirmation BOM consumption for ${req.rawMaterialName}`,
        reference_type: 'ORDER',
        reference_id: opts.orderId,
        actor_user_id: opts.actorUserId,
        created_at: now,
      });
      stmts.push(deductStmt, moveStmt);
    }

    return stmts;
  }

  async prepareOrderEditDeltaStatements(opts: {
    branchId: string;
    orderId: string;
    actorUserId: string;
    oldItems: Array<{ productId: string; quantity: number }>;
    newItems: Array<{ productId: string; quantity: number }>;
    allowPositiveConsumption?: boolean;
  }): Promise<D1PreparedStatementLike[]> {
    const now = new Date().toISOString();
    const stmts: D1PreparedStatementLike[] = [];
    const allowPositive = opts.allowPositiveConsumption !== false;

    // Map quantities by productId
    const oldQtyMap = new Map<string, number>();
    for (const it of opts.oldItems) {
      oldQtyMap.set(it.productId, (oldQtyMap.get(it.productId) ?? 0) + it.quantity);
    }
    const newQtyMap = new Map<string, number>();
    for (const it of opts.newItems) {
      newQtyMap.set(it.productId, (newQtyMap.get(it.productId) ?? 0) + it.quantity);
    }

    const allProductIds = new Set([...oldQtyMap.keys(), ...newQtyMap.keys()]);
    const finishedProductDeltas: Array<{ productId: string; delta: number }> = [];

    for (const pid of allProductIds) {
      const oldQty = oldQtyMap.get(pid) ?? 0;
      const newQty = newQtyMap.get(pid) ?? 0;
      const delta = newQty - oldQty; // positive = more consumed, negative = reversed
      if (delta !== 0) {
        finishedProductDeltas.push({ productId: pid, delta });
      }
    }

    // 1. Finished product delta adjustments
    for (const { productId, delta } of finishedProductDeltas) {
      const inv = await this.inventoryRepo.findByProduct(opts.branchId, productId);
      if (inv !== null) {
        if (delta > 0) {
          // Additional consumption only if allowed (e.g. payment verified or not required)
          if (allowPositive) {
            const deductStmt = this.inventoryRepo.prepareDeductProductStockStatement(
              opts.branchId,
              productId,
              delta,
              now,
            );
            const moveStmt = this.inventoryRepo.prepareCreateMovementStatement({
              branch_id: opts.branchId,
              product_id: productId,
              raw_material_id: null,
              movement_type: InventoryMovementType.ORDER_CONSUMPTION,
              quantity_delta: -delta,
              reason: `Order edit: increased quantity by ${delta}`,
              reference_type: 'ORDER',
              reference_id: opts.orderId,
              actor_user_id: opts.actorUserId,
              created_at: now,
            });
            stmts.push(deductStmt, moveStmt);
          }
        } else {
          // Reversal of stock is always applied immediately
          const reverseQty = Math.abs(delta);
          const addStmt = this.inventoryRepo.prepareAddProductStockStatement(
            opts.branchId,
            productId,
            reverseQty,
            now,
          );
          const moveStmt = this.inventoryRepo.prepareCreateMovementStatement({
            branch_id: opts.branchId,
            product_id: productId,
            raw_material_id: null,
            movement_type: InventoryMovementType.ORDER_REVERSAL,
            quantity_delta: reverseQty,
            reason: `Order edit: reduced quantity by ${reverseQty}`,
            reference_type: 'ORDER',
            reference_id: opts.orderId,
            actor_user_id: opts.actorUserId,
            created_at: now,
          });
          stmts.push(addStmt, moveStmt);
        }
      }
    }

    // 2. Raw material BOM deltas
    const branchComponents = await this.inventoryRepo.listComponentsByBranch(opts.branchId);
    const compsByProduct = new Map<string, ProductComponent[]>();
    for (const comp of branchComponents) {
      const list = compsByProduct.get(comp.product_id) ?? [];
      list.push(comp);
      compsByProduct.set(comp.product_id, list);
    }

    const materialDeltas = new Map<string, number>();
    for (const { productId, delta } of finishedProductDeltas) {
      const comps = compsByProduct.get(productId) ?? [];
      for (const comp of comps) {
        const cur = materialDeltas.get(comp.raw_material_id) ?? 0;
        const add = comp.quantity_required * delta;
        materialDeltas.set(comp.raw_material_id, Math.round((cur + add) * 1000) / 1000);
      }
    }

    for (const [matId, matDelta] of materialDeltas.entries()) {
      if (matDelta > 0) {
        // Additional raw material consumed only if allowed
        if (allowPositive) {
          const deductStmt = this.inventoryRepo.prepareDeductRawMaterialStockStatement(matId, matDelta, now);
          const moveStmt = this.inventoryRepo.prepareCreateMovementStatement({
            branch_id: opts.branchId,
            product_id: null,
            raw_material_id: matId,
            movement_type: InventoryMovementType.ORDER_CONSUMPTION,
            quantity_delta: -matDelta,
            reason: `Order edit BOM consumption (+${matDelta})`,
            reference_type: 'ORDER',
            reference_id: opts.orderId,
            actor_user_id: opts.actorUserId,
            created_at: now,
          });
          stmts.push(deductStmt, moveStmt);
        }
      } else if (matDelta < 0) {
        // Raw material reversed is always applied immediately
        const revQty = Math.abs(matDelta);
        const addStmt = this.inventoryRepo.prepareAddRawMaterialStockStatement(matId, revQty, now);
        const moveStmt = this.inventoryRepo.prepareCreateMovementStatement({
          branch_id: opts.branchId,
          product_id: null,
          raw_material_id: matId,
          movement_type: InventoryMovementType.ORDER_REVERSAL,
          quantity_delta: revQty,
          reason: `Order edit BOM reversal (+${revQty})`,
          reference_type: 'ORDER',
          reference_id: opts.orderId,
          actor_user_id: opts.actorUserId,
          created_at: now,
        });
        stmts.push(addStmt, moveStmt);
      }
    }

    return stmts;
  }

  async prepareFinalizePendingOrderInventoryStatements(opts: {
    branchId: string;
    orderId: string;
    actorUserId: string;
    items: Array<{ productId: string; quantity: number }>;
  }): Promise<{
    statements: D1PreparedStatementLike[];
    pendingDeltas: Array<{ productId: string; quantity: number }>;
  }> {
    // 1. Get net consumed quantities per product for this order from movements
    const netConsumption = await this.inventoryRepo.getNetOrderConsumption(opts.orderId);
    const netConsumedMap = new Map<string, number>();
    for (const c of netConsumption) {
      if (c.product_id) {
        netConsumedMap.set(c.product_id, (netConsumedMap.get(c.product_id) ?? 0) + c.net_consumed);
      }
    }

    // 2. Identify products that have not yet had their positive deltas consumed
    const pendingDeltas: Array<{ productId: string; quantity: number }> = [];
    for (const item of opts.items) {
      const alreadyConsumed = netConsumedMap.get(item.productId) ?? 0;
      const pendingQty = item.quantity - alreadyConsumed;
      if (pendingQty > 0) {
        pendingDeltas.push({ productId: item.productId, quantity: pendingQty });
      }
    }

    if (pendingDeltas.length === 0) {
      return { statements: [], pendingDeltas: [] };
    }

    // 3. Validate stock availability for pending items
    const stockVal = await this.validateStockAvailability(opts.branchId, pendingDeltas);
    if (!stockVal.isAvailable) {
      throw new BadRequestError(`Cannot finalize pending inventory: ${stockVal.errorMessage}`);
    }

    const now = new Date().toISOString();
    const stmts: D1PreparedStatementLike[] = [];

    // 4. Finished product deductions & movements
    for (const pending of pendingDeltas) {
      const inv = await this.inventoryRepo.findByProduct(opts.branchId, pending.productId);
      if (inv !== null) {
        const deductStmt = this.inventoryRepo.prepareDeductProductStockStatement(
          opts.branchId,
          pending.productId,
          pending.quantity,
          now,
        );
        const moveStmt = this.inventoryRepo.prepareCreateMovementStatement({
          branch_id: opts.branchId,
          product_id: pending.productId,
          raw_material_id: null,
          movement_type: InventoryMovementType.ORDER_CONSUMPTION,
          quantity_delta: -pending.quantity,
          reason: `Deferred order edit consumption (+${pending.quantity}) finalized upon payment verification`,
          reference_type: 'ORDER',
          reference_id: opts.orderId,
          actor_user_id: opts.actorUserId,
          created_at: now,
        });
        stmts.push(deductStmt, moveStmt);
      }
    }

    // 5. BOM raw material deductions & movements
    const bomReqs = await this.calculateBOMRequirements(opts.branchId, pendingDeltas);
    for (const req of bomReqs) {
      const deductStmt = this.inventoryRepo.prepareDeductRawMaterialStockStatement(
        req.rawMaterialId,
        req.totalQuantityRequired,
        now,
      );
      const moveStmt = this.inventoryRepo.prepareCreateMovementStatement({
        branch_id: opts.branchId,
        product_id: null,
        raw_material_id: req.rawMaterialId,
        movement_type: InventoryMovementType.ORDER_CONSUMPTION,
        quantity_delta: -req.totalQuantityRequired,
        reason: `Deferred order edit BOM consumption for ${req.rawMaterialName} (+${req.totalQuantityRequired}) finalized upon payment verification`,
        reference_type: 'ORDER',
        reference_id: opts.orderId,
        actor_user_id: opts.actorUserId,
        created_at: now,
      });
      stmts.push(deductStmt, moveStmt);
    }

    return { statements: stmts, pendingDeltas };
  }

  async finalizePendingOrderInventory(opts: {
    branchId: string;
    orderId: string;
    actorUserId: string;
    items: Array<{ productId: string; quantity: number }>;
  }): Promise<void> {
    const { statements, pendingDeltas } = await this.prepareFinalizePendingOrderInventoryStatements(opts);
    if (statements.length > 0) {
      await this.inventoryRepo.executeBatch(statements);
    }

    await this.auditRepo?.log({
      branch_id: opts.branchId,
      actor_user_id: opts.actorUserId,
      action: AuditAction.INVENTORY_CONSUMED,
      entity_type: 'order_inventory',
      entity_id: opts.orderId,
      metadata: {
        orderId: opts.orderId,
        finalizedPendingDeltas: pendingDeltas,
        timestamp: new Date().toISOString(),
      },
    });
  }

  prepareOrderCancellationRestockStatements(opts: {
    branchId: string;
    orderId: string;
    actorUserId?: string | null;
    items: Array<{ productId: string; quantity: number }>;
    nowIso?: string;
  }): D1PreparedStatementLike[] {
    const nowIso = opts.nowIso ?? new Date().toISOString();
    const stmts: D1PreparedStatementLike[] = [];

    for (const item of opts.items) {
      if (item.quantity <= 0) continue;
      stmts.push(
        this.inventoryRepo.prepareRestockStatement(opts.branchId, item.productId, item.quantity, nowIso),
        this.inventoryRepo.prepareMovementStatement(
          {
            id: `mov-${crypto.randomUUID()}`,
            branch_id: opts.branchId,
            inventory_item_type: InventoryItemType.FINISHED_PRODUCT,
            product_id: item.productId,
            raw_material_id: null,
            quantity_delta: item.quantity,
            movement_type: InventoryMovementType.REFILL,
            reason: `Order cancelled - items restocked`,
            reference_type: 'ORDER_CANCEL',
            reference_id: opts.orderId,
            actor_user_id: opts.actorUserId ?? null,
          },
          nowIso,
        ),
      );
    }

    return stmts;
  }
}

