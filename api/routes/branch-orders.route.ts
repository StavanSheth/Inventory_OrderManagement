import { createAuthInfrastructure, AuthFactoryOptions } from '../factories/auth.factory';
import { OrderRepository } from '../../database/repositories/order.repository';
import { PaymentRepository } from '../../database/repositories/payment.repository';
import { ProductRepository } from '../../database/repositories/product.repository';
import { AuditRepository } from '../../database/repositories/audit.repository';
import { BranchRepository } from '../../database/repositories/branch.repository';
import { OrdersService } from '../../backend/services/orders';
import { requireBranchAccess, requireApplicationSession } from '../../backend/policies/branch-access.policy';
import { requireOperatorOrOwner } from '../../backend/policies/role.policy';
import { validateRequest } from '../validators/request.validator';
import { recordPaymentSchema, verifyPaymentSchema, editOrderSchema, updateOrderStatusSchema, idSchema, createBranchOrderSchema } from '../validators/order.validator';
import { successResponse } from '../serializers/response';
import { handleApiError } from '../middleware/error-handler';
import { extractRequestContext } from '../middleware/request-context';
import { handleCorsPreflight, getCorsHeaders } from '../middleware/cors';
import { config } from '../../config/runtime';
import { D1DatabaseLike } from '../../database/types';
import { OrderStatus, PaymentMethod } from '../../shared/enums/order.enum';
import { createRealtimeService } from '../../backend/services/realtime';

import { InventoryService } from '../../backend/services/inventory';
import { PromotionsService } from '../../backend/services/promotions';
import { InventoryRepository } from '../../database/repositories/inventory.repository';
import { PromotionRepository } from '../../database/repositories/promotion.repository';

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

function buildHeaders(request: Request): { corsHeaders: Record<string, string>; responseHeaders: Record<string, string> } {
  const corsHeaders = getCorsHeaders(request, config.allowedOrigins);
  const context = extractRequestContext(request);
  return { corsHeaders, responseHeaders: { ...corsHeaders, 'x-request-id': context.requestId } };
}

/**
 * GET /api/v1/branches/:branchId/orders[?status=PENDING&limit=50]
 * POST /api/v1/branches/:branchId/orders
 * Branch operator order queue and counter order booking.
 */
export async function handleBranchOrdersRoute(
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
    const ordersService = buildOrdersService(db);

    const userContext = await authMiddleware.authenticateRequest(request, {
      requireSession: true,
      targetBranchId: branchId,
    });
    requireOperatorOrOwner(userContext);
    requireApplicationSession(userContext.session, userContext, branchId);
    requireBranchAccess(userContext, branchId);

    // Operator/Owner Direct Order Booking
    if (request.method === 'POST') {
      const rawBody = (await request.json()) as Record<string, unknown>;
      const body = validateRequest(createBranchOrderSchema, { ...rawBody, branchId });

      const result = await ordersService.createOrder({
        actorUserId: userContext.userId,
        branchId,
        customerUserId: body.customerUserId || userContext.userId,
        items: body.items,
        couponId: body.couponId ?? null,
        couponCode: body.couponCode ?? null,
        offerId: body.offerId ?? null,
      });

      let currentOrder = result.order;
      const targetStatus = body.initialStatus || OrderStatus.PENDING;

      if (targetStatus !== OrderStatus.PENDING) {
        // Record payment
        const paymentResult = await ordersService.recordPayment({
          actorUserId: userContext.userId,
          orderId: currentOrder.id,
          branchId,
          amount: currentOrder.total,
          method: (body.paymentMethod as PaymentMethod) || PaymentMethod.CASH,
          notes: body.paymentNotes || 'Counter operator direct booking',
        });
        // Verify payment
        await ordersService.verifyPayment({
          actorUserId: userContext.userId,
          paymentId: paymentResult.payment.id,
          orderId: currentOrder.id,
          branchId,
          notes: 'Counter operator verified',
        });
        // Confirm order
        currentOrder = await ordersService.confirmOrder(userContext.userId, currentOrder.id);

        if (targetStatus === OrderStatus.PREPARING || targetStatus === OrderStatus.READY || targetStatus === OrderStatus.COMPLETED) {
          currentOrder = await ordersService.updateOrderStatus(userContext.userId, currentOrder.id, OrderStatus.PREPARING);
        }
        if (targetStatus === OrderStatus.READY || targetStatus === OrderStatus.COMPLETED) {
          currentOrder = await ordersService.updateOrderStatus(userContext.userId, currentOrder.id, OrderStatus.READY);
        }
        if (targetStatus === OrderStatus.COMPLETED) {
          currentOrder = await ordersService.updateOrderStatus(userContext.userId, currentOrder.id, OrderStatus.COMPLETED);
        }
      }

      return successResponse({ order: currentOrder, items: result.items, expiresAt: result.expiresAt }, 201, responseHeaders);
    }

    const url = new URL(request.url);
    const statusParam = url.searchParams.get('status');
    const limitParam = parseInt(url.searchParams.get('limit') ?? '50', 10);
    const limit = isNaN(limitParam) || limitParam < 1 ? 50 : Math.min(limitParam, 200);

    const status = statusParam && Object.values(OrderStatus).includes(statusParam as OrderStatus)
      ? (statusParam as OrderStatus)
      : undefined;

    const orders = await ordersService.listOrdersByStatus(branchId, status, limit);
    const orderIds = orders.map((o) => o.id);
    const itemsMap = await ordersService.getOrderItemsByOrderIds(orderIds);
    const enriched = orders.map((o) => ({ ...o, items: itemsMap[o.id] ?? [] }));
    return successResponse(enriched, 200, responseHeaders);
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}

/**
 * GET /api/v1/branches/:branchId/orders/:orderId
 * Get full order detail for branch operator.
 */
export async function handleBranchOrderDetailRoute(
  request: Request,
  branchId: string,
  orderId: string,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const { responseHeaders } = buildHeaders(request);

  try {
    validateRequest(idSchema, branchId);
    validateRequest(idSchema, orderId);
    const { db, authMiddleware } = createAuthInfrastructure(env, options);
    const ordersService = buildOrdersService(db);

    const userContext = await authMiddleware.authenticateRequest(request, {
      requireSession: true,
      targetBranchId: branchId,
    });
    requireOperatorOrOwner(userContext);
    requireApplicationSession(userContext.session, userContext, branchId);
    requireBranchAccess(userContext, branchId);

    const detail = await ordersService.getOrderDetail(orderId);
    if (!detail || detail.order.branch_id !== branchId) {
      return handleApiError(new Error('Order not found'), responseHeaders);
    }

    return successResponse(detail, 200, responseHeaders);
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}

/**
 * PATCH /api/v1/branches/:branchId/orders/:orderId/status
 * Body: { status: OrderStatus }
 * Operator transitions order through status state machine.
 */
export async function handleBranchOrderStatusRoute(
  request: Request,
  branchId: string,
  orderId: string,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const { responseHeaders } = buildHeaders(request);

  try {
    validateRequest(idSchema, branchId);
    validateRequest(idSchema, orderId);
    const { db, authMiddleware } = createAuthInfrastructure(env, options);
    const ordersService = buildOrdersService(db);

    const userContext = await authMiddleware.authenticateRequest(request, {
      requireSession: true,
      targetBranchId: branchId,
    });
    requireOperatorOrOwner(userContext);
    requireApplicationSession(userContext.session, userContext, branchId);
    requireBranchAccess(userContext, branchId);

    const body = await request.json();
    const validated = validateRequest(updateOrderStatusSchema, body);
    const nextStatus = validated.status as OrderStatus;

    const updated = await ordersService.updateOrderStatus(userContext.userId, orderId, nextStatus);
    return successResponse(updated, 200, responseHeaders);
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}

/**
 * POST /api/v1/branches/:branchId/orders/:orderId/confirm
 * Operator confirms order after payment is verified.
 */
export async function handleBranchOrderConfirmRoute(
  request: Request,
  branchId: string,
  orderId: string,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const { responseHeaders } = buildHeaders(request);

  try {
    validateRequest(idSchema, branchId);
    validateRequest(idSchema, orderId);
    const { db, authMiddleware } = createAuthInfrastructure(env, options);
    const ordersService = buildOrdersService(db);

    const userContext = await authMiddleware.authenticateRequest(request, {
      requireSession: true,
      targetBranchId: branchId,
    });
    requireOperatorOrOwner(userContext);
    requireApplicationSession(userContext.session, userContext, branchId);
    requireBranchAccess(userContext, branchId);

    const confirmed = await ordersService.confirmOrder(userContext.userId, orderId);
    return successResponse({ order: confirmed, confirmedAt: confirmed.confirmed_at ?? new Date().toISOString() }, 200, responseHeaders);
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}

/**
 * POST /api/v1/branches/:branchId/orders/:orderId/payments
 * Operator records payment at reception.
 */
export async function handleRecordPaymentRoute(
  request: Request,
  branchId: string,
  orderId: string,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const { responseHeaders } = buildHeaders(request);

  try {
    validateRequest(idSchema, branchId);
    validateRequest(idSchema, orderId);
    const { db, authMiddleware } = createAuthInfrastructure(env, options);
    const ordersService = buildOrdersService(db);

    const userContext = await authMiddleware.authenticateRequest(request, {
      requireSession: true,
      targetBranchId: branchId,
    });
    requireOperatorOrOwner(userContext);
    requireApplicationSession(userContext.session, userContext, branchId);
    requireBranchAccess(userContext, branchId);

    const rawBody = await request.json();
    const body = validateRequest(recordPaymentSchema, rawBody);

    const result = await ordersService.recordPayment({
      actorUserId: userContext.userId,
      orderId,
      branchId,
      amount: body.amount,
      method: body.method as PaymentMethod,
      notes: body.notes,
    });

    return successResponse(result, 201, responseHeaders);
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}

/**
 * POST /api/v1/branches/:branchId/orders/:orderId/payments/:paymentId/verify
 * Operator verifies a recorded payment.
 */
export async function handleVerifyPaymentRoute(
  request: Request,
  branchId: string,
  orderId: string,
  paymentId: string,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const { responseHeaders } = buildHeaders(request);

  try {
    validateRequest(idSchema, branchId);
    validateRequest(idSchema, orderId);
    validateRequest(idSchema, paymentId);
    const { db, authMiddleware } = createAuthInfrastructure(env, options);
    const ordersService = buildOrdersService(db);

    const userContext = await authMiddleware.authenticateRequest(request, {
      requireSession: true,
      targetBranchId: branchId,
    });
    requireOperatorOrOwner(userContext);
    requireApplicationSession(userContext.session, userContext, branchId);
    requireBranchAccess(userContext, branchId);

    const rawBody = await request.json().catch(() => ({}));
    const body = validateRequest(verifyPaymentSchema, rawBody);

    const result = await ordersService.verifyPayment({
      actorUserId: userContext.userId,
      paymentId,
      orderId,
      branchId,
      notes: body.notes,
    });

    return successResponse(result, 200, responseHeaders);
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}

/**
 * PATCH /api/v1/branches/:branchId/orders/:orderId
 * Operator edits order (within 60-min window).
 */
export async function handleBranchOrderEditRoute(
  request: Request,
  branchId: string,
  orderId: string,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const { responseHeaders } = buildHeaders(request);

  try {
    validateRequest(idSchema, branchId);
    validateRequest(idSchema, orderId);
    const { db, authMiddleware } = createAuthInfrastructure(env, options);
    const ordersService = buildOrdersService(db);

    const userContext = await authMiddleware.authenticateRequest(request, {
      requireSession: true,
      targetBranchId: branchId,
    });
    requireOperatorOrOwner(userContext);
    requireApplicationSession(userContext.session, userContext, branchId);
    requireBranchAccess(userContext, branchId);

    // Verify order exists and belongs to the specified branch
    const detail = await ordersService.getOrderById(branchId, orderId);
    if (!detail) {
      return handleApiError(new Error(`Order ${orderId} not found in branch ${branchId}`), responseHeaders);
    }

    const rawBody = await request.json();
    const body = validateRequest(editOrderSchema, rawBody);

    const result = await ordersService.editOrder({
      actorUserId: userContext.userId,
      orderId,
      items: body.items,
    });

    return successResponse(result, 200, responseHeaders);
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}

/**
 * POST /api/v1/branches/:branchId/orders/:orderId/cancel
 * Operator cancels order at any stage, with refund calculation and optional inventory restocking.
 */
export async function handleCancelBranchOrderRoute(
  request: Request,
  branchId: string,
  orderId: string,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const { responseHeaders } = buildHeaders(request);

  try {
    validateRequest(idSchema, branchId);
    validateRequest(idSchema, orderId);
    const { db, authMiddleware } = createAuthInfrastructure(env, options);
    const ordersService = buildOrdersService(db);

    const userContext = await authMiddleware.authenticateRequest(request, {
      requireSession: true,
      targetBranchId: branchId,
    });
    requireOperatorOrOwner(userContext);
    requireApplicationSession(userContext.session, userContext, branchId);
    requireBranchAccess(userContext, branchId);

    const rawBody = (await request.json().catch(() => ({}))) as Record<string, any>;
    const refundType = rawBody.refundType as 'FULL' | 'PARTIAL' | 'NONE' | undefined;
    const refundAmount = typeof rawBody.refundAmount === 'number' ? rawBody.refundAmount : undefined;
    const reason = typeof rawBody.reason === 'string' ? rawBody.reason : undefined;
    const restockInventory = rawBody.restockInventory !== false;

    const cancelled = await ordersService.cancelOrder({
      actorUserId: userContext.userId,
      orderId,
      branchId,
      reason,
      refundType,
      refundAmount,
      restockInventory,
    });

    return successResponse(cancelled, 200, responseHeaders);
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}
