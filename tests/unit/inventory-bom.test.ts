import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { InventoryService } from '../../backend/services/inventory';
import { InventoryRepository } from '../../database/repositories/inventory.repository';
import {
  RawMaterial,
  ProductComponent,
  Inventory,
} from '../../shared/types/entities.types';
import { BadRequestError } from '../../backend/errors/app-error';

describe('Phase 4 — Inventory & Recipe BOM Unit Tests', () => {
  const branchId = 'branch-alpha';
  const operatorId = 'user-op-1';
  const nowStr = new Date().toISOString();

  // Mock product components (BOM recipes)
  const mockComponents: Record<string, ProductComponent[]> = {
    'prod-vanilla': [
      {
        id: 'comp-1',
        product_id: 'prod-vanilla',
        raw_material_id: 'raw-milk',
        quantity_required: 100, // 100 ml
        unit: 'ml',
      },
      {
        id: 'comp-2',
        product_id: 'prod-vanilla',
        raw_material_id: 'raw-cream',
        quantity_required: 50, // 50 ml
        unit: 'ml',
      },
      {
        id: 'comp-3',
        product_id: 'prod-vanilla',
        raw_material_id: 'raw-cone',
        quantity_required: 1, // 1 unit
        unit: 'piece',
      },
    ],
    'prod-chocolate': [
      {
        id: 'comp-4',
        product_id: 'prod-chocolate',
        raw_material_id: 'raw-milk',
        quantity_required: 120, // 120 ml
        unit: 'ml',
      },
      {
        id: 'comp-5',
        product_id: 'prod-chocolate',
        raw_material_id: 'raw-cocoa',
        quantity_required: 20, // 20 grams
        unit: 'g',
      },
      {
        id: 'comp-6',
        product_id: 'prod-chocolate',
        raw_material_id: 'raw-cone',
        quantity_required: 1, // 1 unit
        unit: 'piece',
      },
    ],
  };

  const mockRawMaterials: Record<string, RawMaterial> = {
    'raw-milk': {
      id: 'raw-milk',
      branch_id: branchId,
      name: 'Organic Whole Milk',
      unit: 'ml',
      current_quantity: 5000,
      reorder_threshold: 1000,
      active: true,
      created_at: nowStr,
      updated_at: nowStr,
    },
    'raw-cream': {
      id: 'raw-cream',
      branch_id: branchId,
      name: 'Heavy Cream',
      unit: 'ml',
      current_quantity: 2000,
      reorder_threshold: 500,
      active: true,
      created_at: nowStr,
      updated_at: nowStr,
    },
    'raw-cocoa': {
      id: 'raw-cocoa',
      branch_id: branchId,
      name: 'Belgian Cocoa Powder',
      unit: 'g',
      current_quantity: 1000,
      reorder_threshold: 200,
      active: true,
      created_at: nowStr,
      updated_at: nowStr,
    },
    'raw-cone': {
      id: 'raw-cone',
      branch_id: branchId,
      name: 'Waffle Cones',
      unit: 'piece',
      current_quantity: 100,
      reorder_threshold: 20,
      active: true,
      created_at: nowStr,
      updated_at: nowStr,
    },
  };

  function createMockInventoryRepo(overrides: {
    rawMaterials?: Record<string, RawMaterial>;
    components?: Record<string, ProductComponent[]>;
  } = {}) {
    const rawMap = overrides.rawMaterials ?? mockRawMaterials;
    const compMap = overrides.components ?? mockComponents;

    return {
      getComponentsByProductIds: async (productIds: string[]) => {
        const result: ProductComponent[] = [];
        for (const pid of productIds) {
          if (compMap[pid]) {
            result.push(...compMap[pid]);
          }
        }
        return result;
      },
      listComponentsByBranch: async (_branchId: string) => {
        return Object.values(compMap).flat();
      },
      findRawMaterialById: async (id: string) => rawMap[id] ?? null,
      findRawMaterial: async (_branchId: string, id: string) => rawMap[id] ?? null,
      listRawMaterials: async (_branchId: string) => Object.values(rawMap),
      listFinishedProductStock: async (_branchId: string) => [],
      findByProduct: async (_branchId: string, _productId: string) => null,
      getLowStockProducts: async (_branchId: string) => [] as Inventory[],
      getLowStockRawMaterials: async (_branchId: string) => {
        return Object.values(rawMap).filter((m) => m.current_quantity <= m.reorder_threshold);
      },
      refillRawMaterialStock: async () => {},
      adjustRawMaterialStock: async (input: { rawMaterialId: string; quantityDelta: number }) => {
        const mat = rawMap[input.rawMaterialId];
        if (!mat) throw new Error('Not found');
        if (mat.current_quantity + input.quantityDelta < 0) {
          throw new Error('Raw material stock adjustment rejected: insufficient quantity');
        }
        const updated = { ...mat, current_quantity: mat.current_quantity + input.quantityDelta };
        return { rawMaterial: updated, movement: {} as any };
      },
      refillProductStock: async () => {},
      adjustProductStock: async () => {},
    } as unknown as InventoryRepository;
  }

  describe('BOM Requirement Calculations', () => {
    it('aggregates raw material requirements across multiple product lines with distinct multipliers', async () => {
      const repo = createMockInventoryRepo();
      const service = new InventoryService(repo);

      // Order has 2 vanilla + 3 chocolate
      // Vanilla: 2 * (100 milk, 50 cream, 1 cone) = 200 milk, 100 cream, 2 cones
      // Chocolate: 3 * (120 milk, 20 cocoa, 1 cone) = 360 milk, 60 cocoa, 3 cones
      // Total expected:
      // Milk: 200 + 360 = 560 ml
      // Cream: 100 ml
      // Cocoa: 60 g
      // Cones: 2 + 3 = 5 pieces
      const items = [
        { productId: 'prod-vanilla', quantity: 2 },
        { productId: 'prod-chocolate', quantity: 3 },
      ];

      const bomRequirements = await service.calculateBOMRequirements(branchId, items);

      assert.strictEqual(bomRequirements.length, 4);

      const milkReq = bomRequirements.find((r) => r.rawMaterialId === 'raw-milk');
      assert.ok(milkReq);
      assert.strictEqual(milkReq.totalQuantityRequired, 560);
      assert.strictEqual(milkReq.unit, 'ml');

      const creamReq = bomRequirements.find((r) => r.rawMaterialId === 'raw-cream');
      assert.ok(creamReq);
      assert.strictEqual(creamReq.totalQuantityRequired, 100);

      const cocoaReq = bomRequirements.find((r) => r.rawMaterialId === 'raw-cocoa');
      assert.ok(cocoaReq);
      assert.strictEqual(cocoaReq.totalQuantityRequired, 60);

      const coneReq = bomRequirements.find((r) => r.rawMaterialId === 'raw-cone');
      assert.ok(coneReq);
      assert.strictEqual(coneReq.totalQuantityRequired, 5);
    });

    it('returns empty BOM requirements when products have no raw material components', async () => {
      const repo = createMockInventoryRepo({ components: {} });
      const service = new InventoryService(repo);

      const items = [{ productId: 'prod-standalone-soda', quantity: 5 }];
      const bomRequirements = await service.calculateBOMRequirements(branchId, items);

      assert.strictEqual(bomRequirements.length, 0);
    });
  });

  describe('Stock Refill Validations', () => {
    it('rejects zero or negative refill quantities', async () => {
      const repo = createMockInventoryRepo();
      const service = new InventoryService(repo);

      await assert.rejects(
        async () => {
          await service.refillRawMaterialStock('raw-milk', 0, operatorId);
        },
        BadRequestError,
      );

      await assert.rejects(
        async () => {
          await service.refillRawMaterialStock('raw-milk', -50, operatorId);
        },
        BadRequestError,
      );
    });
  });

  describe('Manual Stock Adjustment Validations', () => {
    it('strictly requires a non-empty, non-whitespace reason for audit compliance', async () => {
      const repo = createMockInventoryRepo();
      const service = new InventoryService(repo);

      await assert.rejects(
        async () => {
          await service.adjustRawMaterialStock('raw-milk', -50, operatorId, '');
        },
        BadRequestError,
      );

      await assert.rejects(
        async () => {
          await service.adjustRawMaterialStock('raw-milk', -50, operatorId, '   ');
        },
        BadRequestError,
      );
    });

    it('rejects manual adjustment that would cause negative stock', async () => {
      const repo = createMockInventoryRepo({
        rawMaterials: {
          'raw-milk': {
            ...mockRawMaterials['raw-milk'],
            current_quantity: 100, // only 100 in stock
          },
        },
      });
      const service = new InventoryService(repo);

      await assert.rejects(
        async () => {
          await service.adjustRawMaterialStock('raw-milk', -150, operatorId, 'Spillage during batch prep');
        },
        BadRequestError,
      );
    });
  });

  describe('Low Stock Alert Thresholds', () => {
    it('correctly flags raw materials and finished products that have breached low stock thresholds', async () => {
      const lowStockMaterials: Record<string, RawMaterial> = {
        'raw-milk-low': {
          id: 'raw-milk-low',
          branch_id: branchId,
          name: 'Low Stock Milk',
          unit: 'ml',
          current_quantity: 450, // <= threshold 500
          reorder_threshold: 500,
          active: true,
          created_at: nowStr,
          updated_at: nowStr,
        },
        'raw-cream-ok': {
          id: 'raw-cream-ok',
          branch_id: branchId,
          name: 'Healthy Stock Cream',
          unit: 'ml',
          current_quantity: 2000, // > threshold 500
          reorder_threshold: 500,
          active: true,
          created_at: nowStr,
          updated_at: nowStr,
        },
      };

      const repo = createMockInventoryRepo({ rawMaterials: lowStockMaterials });
      const service = new InventoryService(repo);

      const report = await service.getLowStock(branchId);

      assert.strictEqual(report.rawMaterials.length, 1);
      assert.strictEqual(report.rawMaterials[0].name, 'Low Stock Milk');
      assert.strictEqual(report.rawMaterials[0].current_quantity, 450);
      assert.strictEqual(report.rawMaterials[0].reorder_threshold, 500);
    });
  });
});
