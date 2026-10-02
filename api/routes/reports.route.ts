import { createAuthInfrastructure, AuthFactoryOptions } from '../factories/auth.factory';
import { OrderRepository } from '../../database/repositories/order.repository';
import { BranchRepository } from '../../database/repositories/branch.repository';
import { InventoryRepository } from '../../database/repositories/inventory.repository';
import { UserRepository } from '../../database/repositories/user.repository';
import { handleApiError } from '../middleware/error-handler';
import { requireOwner } from '../../backend/policies/role.policy';
import { handleCorsPreflight, getCorsHeaders } from '../middleware/cors';
import { config } from '../../config/runtime';
import { D1DatabaseLike } from '../../database/types';
import { BadRequestError } from '../../backend/errors/app-error';
import { successResponse } from '../serializers/response';

function toCsvRow(items: Array<string | number | boolean | null | undefined>): string {
  return items
    .map((item) => {
      if (item === null || item === undefined) return '""';
      const str = String(item);
      // Escape quotes by doubling them
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return `"${str}"`;
    })
    .join(',');
}

/**
 * GET /api/v1/owner/reports?type=history|inventory|branches|ledger|customers&format=csv|json&branchId=...&startDate=...&endDate=...
 * Single endpoint to generate and download comprehensive operational and financial reports (Owner Only).
 */
export async function handleOwnerReportsRoute(
  request: Request,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(request, config.allowedOrigins);

  try {
    const { db, authMiddleware } = createAuthInfrastructure(env, options);
    const userContext = await authMiddleware.authenticateRequest(request, { requireSession: false });
    requireOwner(userContext);

    const url = new URL(request.url);
    const type = url.searchParams.get('type') || 'history'; // history, inventory, branches, ledger, customers
    const format = url.searchParams.get('format') || 'csv'; // csv, json
    const branchId = url.searchParams.get('branchId') || 'ALL';
    const startDate = url.searchParams.get('startDate') || undefined;
    const endDate = url.searchParams.get('endDate') || undefined;

    const orderRepo = new OrderRepository(db);
    const branchRepo = new BranchRepository(db);
    const invRepo = new InventoryRepository(db);
    const userRepo = new UserRepository(db);

    let csvContent = '';
    let reportData: unknown = null;
    const filenameTimestamp = new Date().toISOString().slice(0, 10);

    if (type === 'history') {
      const orders = await orderRepo.listOrderHistory({
        branchId: branchId === 'ALL' ? undefined : branchId,
        startDate,
        endDate,
        limit: 1000,
      });

      reportData = orders;

      const headers = [
        'Order Number',
        'Date & Time',
        'Branch ID',
        'Customer ID',
        'Total (INR)',
        'Payment Method',
        'Payment Status',
        'Order Status',
      ];
      const rows = orders.map((o) =>
        toCsvRow([
          o.order_number,
          o.placed_at,
          o.branch_id,
          o.customer_user_id,
          o.total,
          o.payment_method ?? 'N/A',
          o.payment_status,
          o.status,
        ])
      );
      csvContent = [headers.join(','), ...rows].join('\n');
    } else if (type === 'inventory') {
      const { InventoryService } = await import('../../backend/services/inventory');
      const { AuditRepository } = await import('../../database/repositories/audit.repository');
      const invService = new InventoryService(invRepo, new AuditRepository(db));
      const targetBranch = branchId === 'ALL' ? 'branch-alpha' : branchId;
      const products = await invService.listBranchStock(targetBranch);
      const materials = await invService.listRawMaterials(targetBranch, false);

      reportData = { products, materials };

      const headers = [
        'Item Type',
        'Item Name',
        'Category / Unit',
        'Selling Price (INR)',
        'Current Stock',
        'Low Stock Threshold',
        'Status',
      ];

      const productRows = products.map((p: any) =>
        toCsvRow([
          'Finished Product',
          p.name,
          p.category_name ?? 'Ice Cream',
          p.selling_price ?? 0,
          p.current_stock ?? 0,
          p.threshold ?? 10,
          (p.current_stock ?? 0) <= (p.threshold ?? 10) ? 'LOW STOCK' : 'HEALTHY',
        ])
      );

      const matRows = materials.map((m: any) =>
        toCsvRow([
          'Raw Material / Ingredient',
          m.name,
          m.unit,
          'N/A',
          m.current_stock,
          m.threshold,
          m.current_stock <= m.threshold ? 'LOW STOCK' : 'HEALTHY',
        ])
      );

      csvContent = [headers.join(','), ...productRows, ...matRows].join('\n');
    } else if (type === 'branches') {
      const branches = await branchRepo.listAll();
      const rows: string[] = [];

      const branchMetrics = await Promise.all(
        branches.map(async (b: any) => {
          const totalOrders = await orderRepo.countOrderHistory({ branchId: b.id });
          const completedOrders = await orderRepo.countOrderHistory({ branchId: b.id, status: 'COMPLETED' as any });
          const cancelledOrders = await orderRepo.countOrderHistory({ branchId: b.id, status: 'CANCELLED' as any });
          return {
            ...b,
            totalOrders,
            completedOrders,
            cancelledOrders,
          };
        })
      );

      reportData = branchMetrics;

      const headers = [
        'Branch Code',
        'Branch Name',
        'Status',
        'Timezone',
        'Total Orders Placed',
        'Completed Orders',
        'Cancelled Orders',
      ];

      branchMetrics.forEach((bm: any) => {
        rows.push(
          toCsvRow([
            bm.code,
            bm.name,
            bm.status,
            bm.timezone,
            bm.totalOrders,
            bm.completedOrders,
            bm.cancelledOrders,
          ])
        );
      });

      csvContent = [headers.join(','), ...rows].join('\n');
    } else if (type === 'ledger') {
      const orders = await orderRepo.listOrderHistory({
        branchId: branchId === 'ALL' ? undefined : branchId,
        startDate,
        endDate,
        limit: 1000,
      });

      const confirmed = orders.filter((o) => o.status !== 'CANCELLED' && o.status !== 'EXPIRED');
      reportData = confirmed;

      const headers = [
        'Order Number',
        'Date',
        'Branch ID',
        'Payment Method',
        'Subtotal (INR)',
        'Total (INR)',
        'Estimated CGST (2.5%)',
        'Estimated SGST (2.5%)',
      ];

      const rows = confirmed.map((o) => {
        const estCgst = Number((o.total * 0.0238).toFixed(2));
        const estSgst = Number((o.total * 0.0238).toFixed(2));
        return toCsvRow([
          o.order_number,
          o.placed_at.slice(0, 10),
          o.branch_id,
          o.payment_method ?? 'CASH',
          (o.total - estCgst - estSgst).toFixed(2),
          o.total.toFixed(2),
          estCgst,
          estSgst,
        ]);
      });

      csvContent = [headers.join(','), ...rows].join('\n');
    } else if (type === 'customers') {
      const customers = await userRepo.getCustomersWithOrderStats({
        startDate,
        endDate,
        branchId: branchId === 'ALL' ? undefined : branchId,
      });

      reportData = customers;

      const headers = [
        'Customer ID',
        'Customer Name',
        'Email',
        'Phone',
        'Total Orders',
        'Total Spent (INR)',
        'Avg Order Value (INR)',
        'Last Order Date',
        'Segment Tag',
      ];

      const rows = customers.map((c) => {
        let tag = 'REGULAR';
        if (c.totalSpent >= 1000 || c.totalOrders >= 5) tag = 'VIP';
        else if (c.totalOrders >= 3) tag = 'FREQUENT';
        else if (c.totalOrders === 0) tag = 'DORMANT';

        return toCsvRow([
          c.id,
          c.displayName,
          c.email,
          c.phone ?? 'N/A',
          c.totalOrders,
          c.totalSpent.toFixed(2),
          c.avgOrderValue.toFixed(2),
          c.lastOrderAt ?? 'N/A',
          tag,
        ]);
      });

      csvContent = [headers.join(','), ...rows].join('\n');
    } else {
      throw new BadRequestError(`Invalid report type: ${type}`);
    }

    if (format === 'json') {
      return successResponse({ type, data: reportData, generatedAt: new Date().toISOString() }, 200, corsHeaders);
    }

    const filename = `icecream-melt-${type}-report-${filenameTimestamp}.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return handleApiError(error, corsHeaders);
  }
}
