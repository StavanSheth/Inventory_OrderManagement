import { createAuthInfrastructure, AuthFactoryOptions } from '../factories/auth.factory';
import { OrderRepository } from '../../database/repositories/order.repository';
import { PaymentRepository } from '../../database/repositories/payment.repository';
import { ProductRepository } from '../../database/repositories/product.repository';
import { AuditRepository } from '../../database/repositories/audit.repository';
import { BranchRepository } from '../../database/repositories/branch.repository';
import { OrdersService } from '../../backend/services/orders';
import { requireCustomerData } from '../../backend/policies/branch-access.policy';
import { validateRequest } from '../validators/request.validator';
import { createOrderSchema } from '../validators/order.validator';
import { successResponse } from '../serializers/response';
import { handleApiError } from '../middleware/error-handler';
import { extractRequestContext } from '../middleware/request-context';
import { handleCorsPreflight, getCorsHeaders } from '../middleware/cors';
import { config } from '../../config/runtime';
import { D1DatabaseLike } from '../../database/types';
import { createRealtimeService } from '../../backend/services/realtime';
import { InventoryService } from '../../backend/services/inventory';
import { PromotionsService } from '../../backend/services/promotions';
import { InventoryRepository } from '../../database/repositories/inventory.repository';
import { PromotionRepository } from '../../database/repositories/promotion.repository';
import { ForbiddenError } from '../../backend/errors/app-error';

function buildOrdersService(db: D1DatabaseLike): OrdersService {
  const auditRepo = new AuditRepository(db);
  const inventoryRepo = new InventoryRepository(db);
  const promotionRepo = new PromotionRepository(db);
  return new OrdersService(
    new OrderRepository(db),
    new PaymentRepository(db),
    new ProductRepository(db),
    auditRepo,
    new BranchRepository(db),
    createRealtimeService(db),
    new InventoryService(inventoryRepo, auditRepo),
    new PromotionsService(promotionRepo, auditRepo),
  );
}

/**
 * GET /api/v1/customer/orders[?customer_user_id=xxx&limit=50]
 * Returns orders for the authenticated customer.
 * CUSTOMER can only see their own orders.
 * OWNER can query any customer's orders.
 */
export async function handleCustomerOrdersRoute(
  request: Request,
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
    const ordersService = buildOrdersService(db);

    // Customers do not require an operator PIN session
    const userContext = await authMiddleware.authenticateRequest(request, { requireSession: false });

    const url = new URL(request.url);
    const requestedCustomerId = url.searchParams.get('customer_user_id');
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 200);

    if (requestedCustomerId) {
      requireCustomerData(userContext, requestedCustomerId);
    }

    const targetUserId = requestedCustomerId ?? userContext.userId;
    const orders = await ordersService.listCustomerOrders(targetUserId, limit);
    const orderIds = orders.map((o) => o.id);
    const itemsMap = await ordersService.getOrderItemsByOrderIds(orderIds);
    const enriched = orders.map((o) => ({ ...o, items: itemsMap[o.id] ?? [] }));

    return successResponse(enriched, 200, responseHeaders);
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}

/**
 * GET /api/v1/customer/orders/:orderId
 * Customer views their own order detail.
 */
export async function handleCustomerOrderDetailRoute(
  request: Request,
  orderId: string,
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
    const ordersService = buildOrdersService(db);

    const userContext = await authMiddleware.authenticateRequest(request, { requireSession: false });

    const detail = await ordersService.getOrderDetail(orderId);
    if (!detail) {
      return handleApiError(new Error('Order not found'), responseHeaders);
    }

    // Customer can only see their own orders (owner/operator can see any)
    requireCustomerData(userContext, detail.order.customer_user_id);

    return successResponse(detail, 200, responseHeaders);
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}

/**
 * POST /api/v1/customer/orders
 * Customer places a new order.
 */
export async function handleCreateOrderRoute(
  request: Request,
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
    const ordersService = buildOrdersService(db);

    const userContext = await authMiddleware.authenticateRequest(request, { requireSession: false });

    const rawBody = await request.json();
    const body = validateRequest(createOrderSchema, rawBody);

    const result = await ordersService.createOrder({
      actorUserId: userContext.userId,
      branchId: body.branchId,
      customerUserId: userContext.userId,
      items: body.items,
      couponId: body.couponId ?? null,
      couponCode: body.couponCode ?? null,
      offerId: body.offerId ?? null,
    });

    return successResponse(result, 201, responseHeaders);
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}

/**
 * PATCH /api/v1/customer/orders/:orderId
 * Customer editing is strictly disabled per Phase 3 specifications.
 * Only BRANCH_OPERATOR and OWNER may edit orders via branch operator endpoints.
 */
export async function handleEditOrderRoute(
  request: Request,
  _orderId: string,
  _env?: { DB?: D1DatabaseLike },
  _options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(request, config.allowedOrigins);
  const context = extractRequestContext(request);
  const responseHeaders = { ...corsHeaders, 'x-request-id': context.requestId };

  return handleApiError(
    new ForbiddenError('Customer order editing is disabled. Orders may only be modified by authorized branch operators.'),
    responseHeaders,
  );
}

/**
 * POST /api/v1/customer/orders/:orderId/cancel
 * Customer can cancel order only before payment is done.
 */
export async function handleCustomerCancelOrderRoute(
  request: Request,
  orderId: string,
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
    const ordersService = buildOrdersService(db);

    const userContext = await authMiddleware.authenticateRequest(request, { requireSession: false });

    const cancelled = await ordersService.customerCancelOrder(userContext.userId, orderId);
    return successResponse(cancelled, 200, responseHeaders);
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}
