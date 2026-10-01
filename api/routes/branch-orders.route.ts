import { createAuthInfrastructure, AuthFactoryOptions } from '../factories/auth.factory';
import { OrderRepository } from '../../database/repositories/order.repository';
import { OrdersService } from '../../backend/services/orders';
import { requireBranchAccess, requireApplicationSession } from '../../backend/policies/branch-access.policy';
import { requireOperatorOrOwner } from '../../backend/policies/role.policy';
import { successResponse } from '../serializers/response';
import { handleApiError } from '../middleware/error-handler';
import { extractRequestContext } from '../middleware/request-context';
import { handleCorsPreflight, getCorsHeaders } from '../middleware/cors';
import { config } from '../../config/runtime';
import { D1DatabaseLike } from '../../database/types';

/**
 * GET /api/v1/branches/:id/orders
 * Protected API route demonstrating full end-to-end authorization:
 * HTTP request -> middleware -> application session -> role policy -> branch policy -> service -> repository.
 */
export async function handleBranchOrdersRoute(
  request: Request,
  branchId: string,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(request, config.allowedOrigins);
  const context = extractRequestContext(request);
  const responseHeaders = { ...corsHeaders, 'x-request-id': context.requestId };

  try {
    const { db, authMiddleware } = createAuthInfrastructure(env, options);
    const orderRepo = new OrderRepository(db);
    const ordersService = new OrdersService(orderRepo);

    // 1. Authenticate request and verify application PIN session is present
    const userContext = await authMiddleware.authenticateRequest(request, {
      requireSession: true,
      targetBranchId: branchId,
    });

    // 2. Enforce operator or owner role
    requireOperatorOrOwner(userContext);

    // 3. Enforce application session scope (BRANCH session bound to branchId or OWNER GLOBAL session)
    requireApplicationSession(userContext.session, userContext, branchId);

    // 4. Enforce branch authorization boundary (active membership or owner access)
    requireBranchAccess(userContext, branchId);

    // 5. Query service
    const orders = await ordersService.listOrders(branchId);

    return successResponse(orders, 200, responseHeaders);
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}
