export interface BranchDashboardMetrics {
  branchId: string;
  totalOrdersToday: number;
  revenueToday: number;
  lowStockItemsCount: number;
}

export interface IDashboardService {
  getBranchMetrics(branchId: string): Promise<BranchDashboardMetrics>;
}

export const DASHBOARD_SERVICE_TOKEN = 'IDashboardService';
