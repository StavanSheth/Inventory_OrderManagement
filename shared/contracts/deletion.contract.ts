export interface AnonymizeCustomerRequest {
  customerUserId: string;
  reason?: string;
}

export interface AnonymizeCustomerResponse {
  success: boolean;
  customerUserId: string;
  anonymizedAt: string;
  preservedOrdersCount: number;
  revokedSessionsCount: number;
}

export interface BranchDeletionPreviewResponse {
  branchId: string;
  canHardDelete: boolean;
  blockingReasons: string[];
  counts: {
    orders: number;
    payments: number;
    inventoryMovements: number;
    products: number;
    rawMaterials: number;
    activeSessions: number;
    memberships: number;
  };
}
