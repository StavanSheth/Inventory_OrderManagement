import { z } from 'zod';
import { createAuthInfrastructure, AuthFactoryOptions } from '../factories/auth.factory';
import { PromotionsService } from '../../backend/services/promotions';
import { PromotionRepository } from '../../database/repositories/promotion.repository';
import { AuditRepository } from '../../database/repositories/audit.repository';
import { successResponse } from '../serializers/response';
import { handleApiError } from '../middleware/error-handler';
import { extractRequestContext } from '../middleware/request-context';
import { validateRequest } from '../validators/request.validator';
import { idSchema } from '../validators/order.validator';
import { requireOperatorOrOwner } from '../../backend/policies/role.policy';
import { requireBranchAccess, requireApplicationSession } from '../../backend/policies/branch-access.policy';
import { handleCorsPreflight, getCorsHeaders } from '../middleware/cors';
import { config } from '../../config/runtime';
import { D1DatabaseLike } from '../../database/types';
import { BadRequestError } from '../../backend/errors/app-error';
import { DiscountType, OfferType } from '../../shared/enums/promotions.enum';

const createOfferSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  type: z.string().optional(),
  offer_type: z.nativeEnum(OfferType).optional(),
  configuration_json: z.string().optional(),
  start_at: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  end_at: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional().nullable(),
  active: z.boolean().optional(),
  usage_limit: z.number().int().positive().optional().nullable(),
});

const updateOfferSchema = createOfferSchema.partial();

const createCouponSchema = z.object({
  code: z.string().min(2, 'Code must be at least 2 chars').max(50),
  name: z.string().min(1, 'Name is required').max(100),
  discount_type: z.nativeEnum(DiscountType),
  discount_value: z.number().positive('Discount value must be positive'),
  max_discount: z.number().positive().optional().nullable(),
  minimum_order_value: z.number().nonnegative().optional(),
  total_usage_limit: z.number().int().positive().optional().nullable(),
  per_user_usage_limit: z.number().int().positive().optional().nullable(),
  per_user_daily_limit: z.number().int().positive().optional().nullable(),
  start_at: z.string(),
  end_at: z.string(),
  active: z.boolean().optional(),
});

const updateCouponSchema = createCouponSchema.partial();

const validateCouponSchema = z.object({
  code: z.string().min(1, 'Coupon code is required').max(50),
  subtotal: z.number().positive('Subtotal must be positive'),
});

function buildHeaders(request: Request): { corsHeaders: Record<string, string>; responseHeaders: Record<string, string> } {
  const corsHeaders = getCorsHeaders(request, config.allowedOrigins);
  const context = extractRequestContext(request);
  return { corsHeaders, responseHeaders: { ...corsHeaders, 'x-request-id': context.requestId } };
}

function buildPromotionsService(db: D1DatabaseLike): PromotionsService {
  const auditRepo = new AuditRepository(db);
  const promoRepo = new PromotionRepository(db);
  return new PromotionsService(promoRepo, auditRepo);
}

/**
 * GET/POST /api/v1/branches/:branchId/promotions/offers
 */
export async function handleBranchOffersRoute(
  request: Request,
  branchId: string,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const { responseHeaders } = buildHeaders(request);

  try {
    validateRequest(idSchema, branchId);
    const { db, authMiddleware } = createAuthInfrastructure(env, options);
    const promotionsService = buildPromotionsService(db);

    if (request.method === 'GET') {
      const userContext = await authMiddleware.authenticateRequest(request, { requireSession: false });
      const isOperatorOrOwner = userContext.role === 'BRANCH_OPERATOR' || userContext.role === 'OWNER';
      const offers = await promotionsService.listOffers(branchId, !isOperatorOrOwner);
      return successResponse(offers, 200, responseHeaders);
    }

    if (request.method === 'POST') {
      const userContext = await authMiddleware.authenticateRequest(request, {
        requireSession: true,
        targetBranchId: branchId,
      });
      requireOperatorOrOwner(userContext);
      requireApplicationSession(userContext.session, userContext, branchId);
      requireBranchAccess(userContext, branchId);

      const rawBody = await request.json();
      const body = validateRequest(createOfferSchema, rawBody);
      const offerType = (body.offer_type ?? (body.type as OfferType) ?? OfferType.FLAT);

      const created = await promotionsService.createOffer(branchId, userContext.userId, {
        name: body.name,
        description: body.description ?? null,
        offer_type: offerType,
        configuration_json: body.configuration_json,
        start_at: body.start_at,
        end_at: body.end_at ?? null,
        active: body.active,
        usage_limit: body.usage_limit ?? null,
      });
      return successResponse(created, 201, responseHeaders);
    }

    throw new BadRequestError('Method not supported');
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}

/**
 * PATCH/DELETE /api/v1/branches/:branchId/promotions/offers/:offerId
 */
export async function handleSingleOfferRoute(
  request: Request,
  branchId: string,
  offerId: string,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const { responseHeaders } = buildHeaders(request);

  try {
    validateRequest(idSchema, branchId);
    validateRequest(idSchema, offerId);
    const { db, authMiddleware } = createAuthInfrastructure(env, options);
    const promotionsService = buildPromotionsService(db);

    const userContext = await authMiddleware.authenticateRequest(request, {
      requireSession: true,
      targetBranchId: branchId,
    });
    requireOperatorOrOwner(userContext);
    requireApplicationSession(userContext.session, userContext, branchId);
    requireBranchAccess(userContext, branchId);

    if (request.method === 'PATCH') {
      const rawBody = await request.json();
      const body = validateRequest(updateOfferSchema, rawBody);
      const updated = await promotionsService.updateOffer(branchId, offerId, userContext.userId, {
        name: body.name,
        description: body.description,
        offer_type: (body.offer_type ?? (body.type as OfferType | undefined)),
        configuration_json: body.configuration_json,
        start_at: body.start_at,
        end_at: body.end_at ?? undefined,
        active: body.active,
        usage_limit: body.usage_limit,
      });
      return successResponse(updated, 200, responseHeaders);
    }

    if (request.method === 'DELETE') {
      await promotionsService.deactivateOffer(branchId, offerId, userContext.userId);
      return successResponse({ deactivated: true }, 200, responseHeaders);
    }

    throw new BadRequestError('Method not supported');
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}

/**
 * GET/POST /api/v1/branches/:branchId/promotions/coupons
 */
export async function handleBranchCouponsRoute(
  request: Request,
  branchId: string,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const { responseHeaders } = buildHeaders(request);

  try {
    validateRequest(idSchema, branchId);
    const { db, authMiddleware } = createAuthInfrastructure(env, options);
    const promotionsService = buildPromotionsService(db);

    const userContext = await authMiddleware.authenticateRequest(request, {
      requireSession: true,
      targetBranchId: branchId,
    });
    requireOperatorOrOwner(userContext);
    requireApplicationSession(userContext.session, userContext, branchId);
    requireBranchAccess(userContext, branchId);

    if (request.method === 'GET') {
      const coupons = await promotionsService.listCoupons(branchId, false);
      return successResponse(coupons, 200, responseHeaders);
    }

    if (request.method === 'POST') {
      const rawBody = await request.json();
      const body = validateRequest(createCouponSchema, rawBody);
      const created = await promotionsService.createCoupon(branchId, userContext.userId, {
        code: body.code,
        name: body.name,
        discount_type: body.discount_type,
        discount_value: body.discount_value,
        max_discount: body.max_discount ?? null,
        minimum_order_value: body.minimum_order_value,
        total_usage_limit: body.total_usage_limit ?? null,
        per_user_usage_limit: body.per_user_usage_limit ?? null,
        per_user_daily_limit: body.per_user_daily_limit ?? null,
        start_at: body.start_at,
        end_at: body.end_at,
        active: body.active,
      });
      return successResponse(created, 201, responseHeaders);
    }

    throw new BadRequestError('Method not supported');
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}

/**
 * PATCH/DELETE /api/v1/branches/:branchId/promotions/coupons/:couponId
 */
export async function handleSingleCouponRoute(
  request: Request,
  branchId: string,
  couponId: string,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const { responseHeaders } = buildHeaders(request);

  try {
    validateRequest(idSchema, branchId);
    validateRequest(idSchema, couponId);
    const { db, authMiddleware } = createAuthInfrastructure(env, options);
    const promotionsService = buildPromotionsService(db);

    const userContext = await authMiddleware.authenticateRequest(request, {
      requireSession: true,
      targetBranchId: branchId,
    });
    requireOperatorOrOwner(userContext);
    requireApplicationSession(userContext.session, userContext, branchId);
    requireBranchAccess(userContext, branchId);

    if (request.method === 'PATCH') {
      const rawBody = await request.json();
      const body = validateRequest(updateCouponSchema, rawBody);
      const updated = await promotionsService.updateCoupon(branchId, couponId, userContext.userId, {
        code: body.code,
        name: body.name,
        discount_type: body.discount_type,
        discount_value: body.discount_value,
        max_discount: body.max_discount,
        minimum_order_value: body.minimum_order_value,
        total_usage_limit: body.total_usage_limit,
        per_user_usage_limit: body.per_user_usage_limit,
        per_user_daily_limit: body.per_user_daily_limit,
        start_at: body.start_at,
        end_at: body.end_at,
        active: body.active,
      });
      return successResponse(updated, 200, responseHeaders);
    }

    if (request.method === 'DELETE') {
      await promotionsService.deactivateCoupon(branchId, couponId, userContext.userId);
      return successResponse({ deactivated: true }, 200, responseHeaders);
    }

    throw new BadRequestError('Method not supported');
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}

/**
 * POST /api/v1/branches/:branchId/promotions/coupons/validate
 * Customer/Operator endpoint to validate coupon code against current subtotal.
 * Returns authoritative discount preview.
 */
export async function handleValidateCouponRoute(
  request: Request,
  branchId: string,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const { responseHeaders } = buildHeaders(request);

  try {
    validateRequest(idSchema, branchId);
    const { db, authMiddleware } = createAuthInfrastructure(env, options);
    const promotionsService = buildPromotionsService(db);

    const userContext = await authMiddleware.authenticateRequest(request, { requireSession: false });

    const rawBody = await request.json();
    const body = validateRequest(validateCouponSchema, rawBody);

    const result = await promotionsService.validateCoupon({
      branchId,
      code: body.code,
      subtotal: body.subtotal,
      userId: userContext.userId,
    });

    return successResponse(result, 200, responseHeaders);
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}
