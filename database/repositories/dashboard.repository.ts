import { BaseRepository } from './base.repository';
import {
  DashboardTopProduct,
  DashboardLowStockProduct,
  DashboardLowStockMaterial,
} from '../../shared/contracts/dashboard.contract';

export interface DashboardMetricsFilter {
  branchId?: string;
  startDate: string;
  endDate: string;
}

export class DashboardRepository extends BaseRepository {
  async getStatusBreakdown(filter: DashboardMetricsFilter): Promise<Record<string, number>> {
    const res = await this.db
      .prepare(`
        SELECT status, COUNT(*) as count
        FROM orders
        WHERE placed_at >= ? AND placed_at <= ?
          AND (? IS NULL OR branch_id = ?)
        GROUP BY status
      `)
      .bind(filter.startDate, filter.endDate, filter.branchId ?? null, filter.branchId ?? null)
      .all<{ status: string; count: number }>();

    const breakdown: Record<string, number> = {};
    for (const row of res.results) {
      breakdown[row.status] = row.count;
    }
    return breakdown;
  }

  async getRevenueMetrics(filter: DashboardMetricsFilter): Promise<{ revenue: number; eligibleOrdersCount: number }> {
    const row = await this.db
      .prepare(`
        SELECT COALESCE(SUM(total), 0) as total_revenue, COUNT(*) as count
        FROM orders
        WHERE placed_at >= ? AND placed_at <= ?
          AND (? IS NULL OR branch_id = ?)
          AND status IN ('CONFIRMED', 'PREPARING', 'READY', 'COMPLETED')
          AND payment_status IN ('VERIFIED', 'COMPLETED')
      `)
      .bind(filter.startDate, filter.endDate, filter.branchId ?? null, filter.branchId ?? null)
      .first<{ total_revenue: number; count: number }>();

    return {
      revenue: Math.round((row?.total_revenue ?? 0) * 100) / 100,
      eligibleOrdersCount: row?.count ?? 0,
    };
  }

  async getTopProducts(filter: DashboardMetricsFilter, limit: number = 5): Promise<DashboardTopProduct[]> {
    const res = await this.db
      .prepare(`
        SELECT oi.product_id,
               oi.product_name_snapshot as product_name,
               SUM(oi.quantity) as quantity_sold,
               SUM(oi.line_total) as revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.placed_at >= ? AND o.placed_at <= ?
          AND (? IS NULL OR o.branch_id = ?)
          AND o.status IN ('CONFIRMED', 'PREPARING', 'READY', 'COMPLETED')
        GROUP BY oi.product_id, oi.product_name_snapshot
        ORDER BY quantity_sold DESC
        LIMIT ?
      `)
      .bind(filter.startDate, filter.endDate, filter.branchId ?? null, filter.branchId ?? null, limit)
      .all<{ product_id: string; product_name: string; quantity_sold: number; revenue: number }>();

    return res.results.map((r) => ({
      productId: r.product_id,
      productName: r.product_name,
      quantitySold: r.quantity_sold,
      revenue: Math.round(r.revenue * 100) / 100,
    }));
  }

  async getPromotionMetrics(filter: DashboardMetricsFilter): Promise<{ couponUsageCount: number; offerUsageCount: number }> {
    const couponRow = await this.db
      .prepare(`
        SELECT COUNT(*) as count
        FROM coupon_usages cu
        JOIN orders o ON o.id = cu.order_id
        WHERE o.placed_at >= ? AND o.placed_at <= ?
          AND (? IS NULL OR o.branch_id = ?)
      `)
      .bind(filter.startDate, filter.endDate, filter.branchId ?? null, filter.branchId ?? null)
      .first<{ count: number }>();

    const offerRow = await this.db
      .prepare(`
        SELECT COUNT(*) as count
        FROM orders o
        WHERE o.placed_at >= ? AND o.placed_at <= ?
          AND (? IS NULL OR o.branch_id = ?)
          AND o.offer_id IS NOT NULL
          AND o.status IN ('CONFIRMED', 'PREPARING', 'READY', 'COMPLETED')
      `)
      .bind(filter.startDate, filter.endDate, filter.branchId ?? null, filter.branchId ?? null)
      .first<{ count: number }>();

    return {
      couponUsageCount: couponRow?.count ?? 0,
      offerUsageCount: offerRow?.count ?? 0,
    };
  }

  async getLowStockAlerts(branchId?: string): Promise<{
    lowStockProducts: DashboardLowStockProduct[];
    lowStockRawMaterials: DashboardLowStockMaterial[];
  }> {
    const prodRes = await this.db
      .prepare(`
        SELECT i.product_id, p.name as product_name, i.quantity, i.reorder_threshold
        FROM inventory i
        JOIN products p ON p.id = i.product_id
        WHERE (? IS NULL OR i.branch_id = ?)
          AND i.quantity <= i.reorder_threshold
        ORDER BY i.quantity ASC
        LIMIT 50
      `)
      .bind(branchId ?? null, branchId ?? null)
      .all<{ product_id: string; product_name: string; quantity: number; reorder_threshold: number }>();

    const matRes = await this.db
      .prepare(`
        SELECT rm.id as material_id, rm.name, rm.current_quantity as quantity, rm.unit, rm.reorder_threshold
        FROM raw_materials rm
        WHERE (? IS NULL OR rm.branch_id = ?)
          AND rm.active = 1
          AND rm.current_quantity <= rm.reorder_threshold
        ORDER BY rm.current_quantity ASC
        LIMIT 50
      `)
      .bind(branchId ?? null, branchId ?? null)
      .all<{ material_id: string; name: string; quantity: number; unit: string; reorder_threshold: number }>();

    return {
      lowStockProducts: prodRes.results.map((p) => ({
        productId: p.product_id,
        productName: p.product_name,
        quantity: p.quantity,
        reorderThreshold: p.reorder_threshold,
      })),
      lowStockRawMaterials: matRes.results.map((m) => ({
        materialId: m.material_id,
        name: m.name,
        quantity: m.quantity,
        unit: m.unit,
        reorderThreshold: m.reorder_threshold,
      })),
    };
  }
}
