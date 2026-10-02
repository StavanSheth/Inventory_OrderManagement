import { createAuthInfrastructure, AuthFactoryOptions } from '../factories/auth.factory';
import { PromotionRepository } from '../../database/repositories/promotion.repository';
import { successResponse } from '../serializers/response';
import { handleApiError } from '../middleware/error-handler';
import { handleCorsPreflight, getCorsHeaders } from '../middleware/cors';
import { config } from '../../config/runtime';
import { D1DatabaseLike } from '../../database/types';

/**
 * GET /api/v1/customer/coupons
 * Returns active private / targeted promo codes assigned to the authenticated customer.
 */
export async function handleCustomerCouponsRoute(
  request: Request,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(request, config.allowedOrigins);

  try {
    const { db, authMiddleware } = createAuthInfrastructure(env, options);
    let userId: string | null = null;

    try {
      const userContext = await authMiddleware.authenticateRequest(request, { requireSession: false });
      userId = userContext.userId;
    } catch {
      // In dev mode or fallback header
      const devUser = request.headers.get('x-dev-user-id');
      if (devUser) {
        userId = devUser;
      }
    }

    if (!userId) {
      return successResponse([], 200, corsHeaders);
    }

    const url = new URL(request.url);
    const branchId = url.searchParams.get('branchId') || undefined;

    const promoRepo = new PromotionRepository(db);
    const coupons = await promoRepo.getPrivateCouponsForUser(userId, branchId);

    return successResponse(coupons, 200, corsHeaders);
  } catch (error) {
    return handleApiError(error, corsHeaders);
  }
}
