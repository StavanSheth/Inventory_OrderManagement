import { D1DatabaseLike } from '../../../database/types';
import { DashboardRepository } from '../../../database/repositories/dashboard.repository';
import { BranchRepository } from '../../../database/repositories/branch.repository';
import {
  DashboardSummaryResponse,
} from '../../../shared/contracts/dashboard.contract';
import { OrderStatus } from '../../../shared/enums/order.enum';
import { BadRequestError } from '../../errors/app-error';

export interface BranchDashboardMetrics {
  branchId: string;
  totalOrders: number;
  lowStockItemsCount: number;
}

export interface GetDashboardSummaryOptions {
  branchId?: string | null;
  startDate?: string;
  endDate?: string;
  preset?: 'today' | 'week' | 'month' | 'custom';
}

export interface IDashboardService {
  getBranchMetrics(branchId: string): Promise<BranchDashboardMetrics>;
  getSummary(options: GetDashboardSummaryOptions): Promise<DashboardSummaryResponse>;
}

export const DASHBOARD_SERVICE_TOKEN = 'IDashboardService';

export class DashboardService implements IDashboardService {
  private dashboardRepo: DashboardRepository;
  private branchRepo: BranchRepository;

  constructor(private db: D1DatabaseLike) {
    this.dashboardRepo = new DashboardRepository(db);
    this.branchRepo = new BranchRepository(db);
  }

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

  async getSummary(options: GetDashboardSummaryOptions): Promise<DashboardSummaryResponse> {
    const now = new Date();
    let startDate: Date;
    let endDate: Date;
    const preset = options.preset ?? 'today';

    if (preset === 'today') {
      startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
      endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    } else if (preset === 'week') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      endDate = now;
    } else if (preset === 'month') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      endDate = now;
    } else if (preset === 'custom') {
      if (!options.startDate || !options.endDate) {
        throw new BadRequestError('startDate and endDate are required for custom date range');
      }
      startDate = new Date(options.startDate);
      endDate = new Date(options.endDate);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new BadRequestError('Invalid date format for startDate or endDate');
      }
      if (startDate > endDate) {
        throw new BadRequestError('startDate cannot be after endDate');
      }
    } else {
      throw new BadRequestError(`Unsupported preset: ${preset}`);
    }

    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();
    const branchId = options.branchId && options.branchId !== 'all' ? options.branchId : undefined;

    let branchName: string | null = null;
    if (branchId) {
      const b = await this.branchRepo.findById(branchId);
      branchName = b?.name ?? null;
    }

    const filter = { branchId, startDate: startIso, endDate: endIso };

    // Parallel database aggregation execution
    const [statusBreakdown, revenueData, topProducts, promotionData, lowStockAlerts] = await Promise.all([
      this.dashboardRepo.getStatusBreakdown(filter),
      this.dashboardRepo.getRevenueMetrics(filter),
      this.dashboardRepo.getTopProducts(filter, 5),
      this.dashboardRepo.getPromotionMetrics(filter),
      this.dashboardRepo.getLowStockAlerts(branchId),
    ]);

    const totalOrders = Object.values(statusBreakdown).reduce((sum, count) => sum + count, 0);
    const confirmedOrders = statusBreakdown[OrderStatus.CONFIRMED] ?? 0;
    const pendingOrders = statusBreakdown[OrderStatus.PENDING] ?? 0;
    const expiredOrders = statusBreakdown[OrderStatus.EXPIRED] ?? 0;
    const cancelledOrders = statusBreakdown[OrderStatus.CANCELLED] ?? 0;
    const completedOrders = statusBreakdown[OrderStatus.COMPLETED] ?? 0;

    const revenue = revenueData.revenue;
    const aov = revenueData.eligibleOrdersCount > 0
      ? Math.round((revenue / revenueData.eligibleOrdersCount) * 100) / 100
      : 0;

    return {
      branchId: branchId ?? null,
      branchName,
      period: {
        startDate: startIso,
        endDate: endIso,
        preset,
      },
      metrics: {
        totalOrders,
        confirmedOrders,
        pendingOrders,
        expiredOrders,
        cancelledOrders,
        completedOrders,
        revenue,
        averageOrderValue: aov,
      },
      topProducts,
      promotions: promotionData,
      inventoryAlerts: lowStockAlerts,
    };
  }
}
