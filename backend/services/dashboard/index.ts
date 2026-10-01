import { D1DatabaseLike } from '../../../database/types';

export interface BranchDashboardMetrics {
  branchId: string;
  totalOrders: number;
  lowStockItemsCount: number;
}

export interface IDashboardService {
  getBranchMetrics(branchId: string): Promise<BranchDashboardMetrics>;
}

export const DASHBOARD_SERVICE_TOKEN = 'IDashboardService';

export class DashboardService implements IDashboardService {
  constructor(private db: D1DatabaseLike) {}

  async getBranchMetrics(branchId: string): Promise<BranchDashboardMetrics> {
    const orderCountRow = await this.db
      .prepare('SELECT COUNT(*) as count FROM orders WHERE branch_id = ?')
      .bind(branchId)
      .first<{ count: number }>();

    const lowStockRow = await this.db
      .prepare('SELECT COUNT(*) as count FROM inventory WHERE branch_id = ? AND quantity <= reorder_threshold')
      .bind(branchId)
      .first<{ count: number }>();

    return {
      branchId,
      totalOrders: orderCountRow?.count ?? 0,
      lowStockItemsCount: lowStockRow?.count ?? 0,
    };
  }
}
