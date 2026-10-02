import { createAuthInfrastructure, AuthFactoryOptions } from '../factories/auth.factory';
import { OrdersService } from '../../backend/services/orders';
import { OrderRepository } from '../../database/repositories/order.repository';
import { PaymentRepository } from '../../database/repositories/payment.repository';
import { ProductRepository } from '../../database/repositories/product.repository';
import { AuditRepository } from '../../database/repositories/audit.repository';
import { BranchRepository } from '../../database/repositories/branch.repository';
import { InventoryRepository } from '../../database/repositories/inventory.repository';
import { InventoryService } from '../../backend/services/inventory';
import { PromotionsService } from '../../backend/services/promotions';
import { successResponse } from '../serializers/response';
import { handleApiError } from '../middleware/error-handler';
import { requireApplicationSession } from '../../backend/policies/branch-access.policy';
import { handleCorsPreflight, getCorsHeaders } from '../middleware/cors';
import { config } from '../../config/runtime';
import { D1DatabaseLike } from '../../database/types';
import { UserRole } from '../../shared/enums/roles.enum';
import { OrderStatus } from '../../shared/enums/order.enum';
import { ForbiddenError, BadRequestError } from '../../backend/errors/app-error';

/**
 * GET /api/v1/orders/history
 * Unified paginated order history API with role-based scoping:
 * - Customer: strictly own orders only.
 * - Operator: strictly assigned branch only (defaults to today).
 * - Owner: all branches or selected branch.
 */
export async function handleOrderHistoryRoute(
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

    const url = new URL(request.url);
    const requestedBranchId = url.searchParams.get('branchId') ?? undefined;
    const requestedCustomerUserId = url.searchParams.get('customerUserId') ?? undefined;
    const startDate = url.searchParams.get('startDate') ?? undefined;
    const endDate = url.searchParams.get('endDate') ?? undefined;
    const statusParam = url.searchParams.get('status') ?? undefined;
    const pageParam = url.searchParams.get('page');
    const limitParam = url.searchParams.get('limit');

    const page = pageParam ? parseInt(pageParam, 10) : 1;
    const limit = limitParam ? parseInt(limitParam, 10) : 20;

    let status: OrderStatus | undefined;
    if (statusParam && statusParam !== 'ALL') {
      if (!Object.values(OrderStatus).includes(statusParam as OrderStatus)) {
        throw new BadRequestError(`Invalid status parameter: ${statusParam}`);
      }
      status = statusParam as OrderStatus;
    }

    let effectiveBranchId = requestedBranchId;
    let effectiveCustomerUserId = requestedCustomerUserId;

    // Role-specific scoping & defense against tampering
    if (userContext.role === UserRole.CUSTOMER) {
      if (requestedCustomerUserId && requestedCustomerUserId !== userContext.userId) {
        throw new ForbiddenError('Customers cannot access orders of another customer');
      }
      effectiveCustomerUserId = userContext.userId;
      effectiveBranchId = undefined;
    } else if (userContext.role === UserRole.BRANCH_OPERATOR) {
      requireApplicationSession(userContext.session, userContext);
      if (userContext.session?.scope !== 'GLOBAL') {
        if (requestedBranchId && requestedBranchId !== userContext.session?.branchId) {
          throw new ForbiddenError('Operators cannot access orders of another branch');
        }
        effectiveBranchId = userContext.session?.branchId ?? undefined;
      }
    }

    const orderRepo = new OrderRepository(db);
    const paymentRepo = new PaymentRepository(db);
    const productRepo = new ProductRepository(db);
    const auditRepo = new AuditRepository(db);
    const branchRepo = new BranchRepository(db);
    const inventoryRepo = new InventoryRepository(db);
    const inventoryService = new InventoryService(inventoryRepo, auditRepo);
    const promotionsService = new PromotionsService(db, auditRepo);

    const ordersService = new OrdersService(
      orderRepo,
      paymentRepo,
      productRepo,
      auditRepo,
      branchRepo,
      undefined,
      inventoryService,
      promotionsService,
    );

    const history = await ordersService.listOrderHistory({
      actorRole: userContext.role,
      actorUserId: userContext.userId,
      branchId: effectiveBranchId,
      customerUserId: effectiveCustomerUserId,
      startDate,
      endDate,
      status,
      page,
      limit,
    });

    return successResponse(history, 200, corsHeaders);
  } catch (error) {
    return handleApiError(error, corsHeaders);
  }
}
