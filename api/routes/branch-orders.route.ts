import { AuthMiddleware } from '../../backend/middleware/auth.middleware';
import { FirebaseVerifier } from '../../backend/services/auth/firebase-verifier';
import { UserSyncService } from '../../backend/services/auth/user-sync.service';
import { SessionService } from '../../backend/services/auth/session.service';
import { UserRepository } from '../../database/repositories/user.repository';
import { SessionRepository } from '../../database/repositories/session.repository';
import { OrderRepository } from '../../database/repositories/order.repository';
import { OrdersService } from '../../backend/services/orders';
import { requireBranchAccess } from '../../backend/policies/branch-access.policy';
import { requireOperatorOrOwner } from '../../backend/policies/role.policy';
import { successResponse } from '../serializers/response';
import { handleApiError } from '../middleware/error-handler';
import { extractRequestContext } from '../middleware/request-context';
import { handleCorsPreflight, getCorsHeaders } from '../middleware/cors';
import { config } from '../../config/runtime';
import { D1DatabaseLike } from '../../database/types';
import { getDatabase } from '../../database/runtime';

/**
 * GET /api/v1/branches/:id/orders
 * Protected API route demonstrating full end-to-end authorization:
 * HTTP request -> middleware -> authenticated context -> role policy -> branch policy -> service -> repository.
 */
export async function handleBranchOrdersRoute(
  request: Request,
  branchId: string,
  env?: { DB?: D1DatabaseLike },
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(request, config.allowedOrigins);
  const context = extractRequestContext(request);
  const responseHeaders = { ...corsHeaders, 'x-request-id': context.requestId };

  try {
    const db = getDatabase(env);
    const userRepo = new UserRepository(db);
    const sessionRepo = new SessionRepository(db);
    const orderRepo = new OrderRepository(db);
    const ordersService = new OrdersService(orderRepo);

    const firebaseVerifier = new FirebaseVerifier(config.firebase.projectId);
    const userSyncService = new UserSyncService(userRepo, db);
    const sessionService = new SessionService(sessionRepo, userRepo, db);
    const authMiddleware = new AuthMiddleware({
      firebaseVerifier,
      userSyncService,
      sessionService,
    });

    // 1. Authenticate request
    const userContext = await authMiddleware.authenticateRequest(request);

    // 2. Enforce operator or owner role
    requireOperatorOrOwner(userContext);

    // 3. Enforce branch authorization boundary (Branch A operator cannot access Branch B)
    requireBranchAccess(userContext, branchId);

    // 4. Execute service call
    const orders = await ordersService.listOrders(branchId);
    return successResponse(orders, 200, responseHeaders);
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}
