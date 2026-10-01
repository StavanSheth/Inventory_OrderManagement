import { Inventory, InventoryMovement } from '../../../shared/types/entities.types';
import { InventoryRepository } from '../../../database/repositories/inventory.repository';

export interface IInventoryService {
  getStock(branchId: string, productId: string): Promise<Inventory | null>;
  listBranchStock(branchId: string): Promise<Inventory[]>;
  getMovements(branchId: string, limit?: number): Promise<InventoryMovement[]>;
}

export const INVENTORY_SERVICE_TOKEN = 'IInventoryService';

export class InventoryService implements IInventoryService {
  constructor(private inventoryRepo: InventoryRepository) {}

  async getStock(branchId: string, productId: string): Promise<Inventory | null> {
    return this.inventoryRepo.findByProduct(branchId, productId);
  }

  async listBranchStock(branchId: string): Promise<Inventory[]> {
    return this.inventoryRepo.listByBranch(branchId);
  }

  async getMovements(branchId: string, limit: number = 50): Promise<InventoryMovement[]> {
    return this.inventoryRepo.listMovements(branchId, limit);
  }
}
