export interface DashboardDateRange {
  startDate: string;
  endDate: string;
  preset?: 'today' | 'week' | 'month' | 'custom';
}

export interface DashboardTopProduct {
  productId: string;
  productName: string;
  quantitySold: number;
  revenue: number;
}

export interface DashboardLowStockProduct {
  productId: string;
  productName: string;
  quantity: number;
  reorderThreshold: number;
}

export interface DashboardLowStockMaterial {
  materialId: string;
  name: string;
  quantity: number;
  unit: string;
  reorderThreshold: number;
}

export interface DashboardSummaryResponse {
  branchId?: string | null;
  branchName?: string | null;
  period: {
    startDate: string;
    endDate: string;
    preset?: string;
  };
  metrics: {
    totalOrders: number;
    confirmedOrders: number;
    pendingOrders: number;
    expiredOrders: number;
    cancelledOrders: number;
    completedOrders: number;
    revenue: number;
    averageOrderValue: number;
  };
  topProducts: DashboardTopProduct[];
  promotions: {
    couponUsageCount: number;
    offerUsageCount: number;
  };
  inventoryAlerts: {
    lowStockProducts: DashboardLowStockProduct[];
    lowStockRawMaterials: DashboardLowStockMaterial[];
  };
}
