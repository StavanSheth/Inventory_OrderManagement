import { AuthMiddleware } from '../../backend/middleware/auth.middleware';
import { FirebaseVerifier } from '../../backend/services/auth/firebase-verifier';
import { UserSyncService } from '../../backend/services/auth/user-sync.service';
import { UserRepository } from '../../database/repositories/user.repository';
import { OrderRepository } from '../../database/repositories/order.repository';
import { requireCustomerData } from '../../backend/policies/branch-access.policy';
import { successResponse } from '../serializers/response';
import { handleApiError } from '../middleware/error-handler';
import { extractRequestContext } from '../middleware/request-context';
import { handleCorsPreflight, getCorsHeaders } from '../middleware/cors';
import { config } from '../../config/runtime';
import { D1DatabaseLike } from '../../database/types';
import { getDatabase } from '../../database/runtime';

/**
 * GET /api/v1/customer/orders
 * Returns orders for the authenticated customer only.
 * Proves that customer_user_id cannot be spoofed via query params.
 */
export async function handleCustomerOrdersRoute(
  request: Request,
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
    const orderRepo = new OrderRepository(db);

    const firebaseVerifier = new FirebaseVerifier(config.firebase.projectId);
    const userSyncService = new UserSyncService(userRepo, db);
    const authMiddleware = new AuthMiddleware({
      firebaseVerifier,
      userSyncService,
    });

    // 1. Authenticate request
    const userContext = await authMiddleware.authenticateRequest(request);

    // 2. If client attempts to pass customer_user_id in query, enforce ownership policy
    const url = new URL(request.url);
    const requestedCustomerId = url.searchParams.get('customer_user_id');
    if (requestedCustomerId) {
      requireCustomerData(userContext, requestedCustomerId);
    }

    // 3. Query repository by verified customer identity
    const targetUserId = requestedCustomerId ?? userContext.userId;
    const orders = await orderRepo.listByCustomer(targetUserId);

    return successResponse(orders, 200, responseHeaders);
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}
