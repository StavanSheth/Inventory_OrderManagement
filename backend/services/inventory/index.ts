import { Inventory, InventoryMovement } from '../../../shared/types/entities.types';

export interface IInventoryService {
  getStock(branchId: string, productId: string): Promise<Inventory | null>;
  listBranchStock(branchId: string): Promise<Inventory[]>;
  getMovements(branchId: string, limit?: number): Promise<InventoryMovement[]>;
}

export const INVENTORY_SERVICE_TOKEN = 'IInventoryService';
