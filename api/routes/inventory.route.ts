import { z } from 'zod';
import { createAuthInfrastructure, AuthFactoryOptions } from '../factories/auth.factory';
import { InventoryService } from '../../backend/services/inventory';
import { InventoryRepository } from '../../database/repositories/inventory.repository';
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

const refillSchema = z.object({
  productId: z.string().max(100).optional(),
  rawMaterialId: z.string().max(100).optional(),
  quantity: z.number().positive('Refill quantity must be positive'),
  reason: z.string().max(500).optional(),
}).refine((data) => data.productId || data.rawMaterialId, {
  message: 'Either productId or rawMaterialId must be specified for refill',
});

const adjustSchema = z.object({
  productId: z.string().max(100).optional(),
  rawMaterialId: z.string().max(100).optional(),
  delta: z.number().refine((d) => d !== 0, 'Delta cannot be 0'),
  reason: z.string().min(1, 'Adjustment reason is strictly mandatory').max(500),
}).refine((data) => data.productId || data.rawMaterialId, {
  message: 'Either productId or rawMaterialId must be specified for adjustment',
});

const rawMaterialSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  unit: z.string().min(1, 'Unit is required').max(20),
  current_quantity: z.number().nonnegative().optional(),
  reorder_threshold: z.number().nonnegative().optional(),
});

const setBOMSchema = z.object({
  components: z.array(
    z.object({
      rawMaterialId: z.string().min(1),
      quantityRequired: z.number().positive('Quantity required must be positive'),
    }),
  ),
});

const updatePricingSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  selling_price: z.number().nonnegative().optional(),
  tax_rate: z.number().min(0).max(100).optional(),
  cgst_rate: z.number().min(0).max(100).optional(),
  sgst_rate: z.number().min(0).max(100).optional(),
  igst_rate: z.number().min(0).max(100).optional(),
  serving_size: z.string().optional(),
  price_rate: z.number().nonnegative().optional(),
  serving_sizes_json: z.string().optional(),
});

function buildHeaders(request: Request): { corsHeaders: Record<string, string>; responseHeaders: Record<string, string> } {
  const corsHeaders = getCorsHeaders(request, config.allowedOrigins);
  const context = extractRequestContext(request);
  return { corsHeaders, responseHeaders: { ...corsHeaders, 'x-request-id': context.requestId } };
}

function buildInventoryService(db: D1DatabaseLike): InventoryService {
  const auditRepo = new AuditRepository(db);
  const inventoryRepo = new InventoryRepository(db);
  return new InventoryService(inventoryRepo, auditRepo);
}

/**
 * GET /api/v1/branches/:branchId/inventory
 * Operator/Owner view of branch inventory (finished products, raw materials, low stock report).
 */
export async function handleGetInventoryRoute(
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
    const inventoryService = buildInventoryService(db);

    const userContext = await authMiddleware.authenticateRequest(request, {
      requireSession: true,
      targetBranchId: branchId,
    });
    requireOperatorOrOwner(userContext);
    requireApplicationSession(userContext.session, userContext, branchId);
    requireBranchAccess(userContext, branchId);

    const [products, rawMaterials, lowStock] = await Promise.all([
      inventoryService.listBranchStock(branchId),
      inventoryService.listRawMaterials(branchId, false),
      inventoryService.getLowStock(branchId),
    ]);

    return successResponse(
      {
        branchId,
        products,
        rawMaterials,
        lowStock,
      },
      200,
      responseHeaders,
    );
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}

/**
 * POST /api/v1/branches/:branchId/inventory/refill
 * Refill finished product or raw material stock.
 */
export async function handleRefillInventoryRoute(
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
    const inventoryService = buildInventoryService(db);

    const userContext = await authMiddleware.authenticateRequest(request, {
      requireSession: true,
      targetBranchId: branchId,
    });
    requireOperatorOrOwner(userContext);
    requireApplicationSession(userContext.session, userContext, branchId);
    requireBranchAccess(userContext, branchId);

    const rawBody = await request.json();
    const body = validateRequest(refillSchema, rawBody);

    let result;
    if (body.productId) {
      result = await inventoryService.refillProductStock(
        branchId,
        body.productId,
        body.quantity,
        userContext.userId,
        body.reason,
      );
    } else if (body.rawMaterialId) {
      result = await inventoryService.refillRawMaterialStock(
        body.rawMaterialId,
        body.quantity,
        userContext.userId,
        body.reason,
      );
    }

    return successResponse(result, 200, responseHeaders);
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}

/**
 * POST /api/v1/branches/:branchId/inventory/adjust
 * Manual stock adjustment (requires reason).
 */
export async function handleAdjustInventoryRoute(
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
    const inventoryService = buildInventoryService(db);

    const userContext = await authMiddleware.authenticateRequest(request, {
      requireSession: true,
      targetBranchId: branchId,
    });
    requireOperatorOrOwner(userContext);
    requireApplicationSession(userContext.session, userContext, branchId);
    requireBranchAccess(userContext, branchId);

    const rawBody = await request.json();
    const body = validateRequest(adjustSchema, rawBody);

    let result;
    if (body.productId) {
      result = await inventoryService.adjustProductStock(
        branchId,
        body.productId,
        body.delta,
        userContext.userId,
        body.reason,
      );
    } else if (body.rawMaterialId) {
      result = await inventoryService.adjustRawMaterialStock(
        body.rawMaterialId,
        body.delta,
        userContext.userId,
        body.reason,
      );
    }

    return successResponse(result, 200, responseHeaders);
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}

/**
 * GET /api/v1/branches/:branchId/inventory/movements
 * Audit ledger of all inventory movements for the branch.
 */
export async function handleGetMovementsRoute(
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
    const inventoryService = buildInventoryService(db);

    const userContext = await authMiddleware.authenticateRequest(request, {
      requireSession: true,
      targetBranchId: branchId,
    });
    requireOperatorOrOwner(userContext);
    requireApplicationSession(userContext.session, userContext, branchId);
    requireBranchAccess(userContext, branchId);

    const movements = await inventoryService.getMovements(branchId, 100);
    return successResponse(movements, 200, responseHeaders);
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}

/**
 * POST /api/v1/branches/:branchId/inventory/raw-materials
 * Create a new raw material for the branch.
 */
export async function handleCreateRawMaterialRoute(
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
    const inventoryService = buildInventoryService(db);

    const userContext = await authMiddleware.authenticateRequest(request, {
      requireSession: true,
      targetBranchId: branchId,
    });
    requireOperatorOrOwner(userContext);
    requireApplicationSession(userContext.session, userContext, branchId);
    requireBranchAccess(userContext, branchId);

    const rawBody = await request.json();
    const body = validateRequest(rawMaterialSchema, rawBody);

    const created = await inventoryService.createRawMaterial(branchId, userContext.userId, body);
    return successResponse(created, 201, responseHeaders);
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}

/**
 * GET/PUT /api/v1/branches/:branchId/inventory/bom/:productId
 * Manage Product BOM components.
 */
export async function handleProductBOMRoute(
  request: Request,
  branchId: string,
  productId: string,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const { responseHeaders } = buildHeaders(request);

  try {
    validateRequest(idSchema, branchId);
    validateRequest(idSchema, productId);
    const { db, authMiddleware } = createAuthInfrastructure(env, options);
    const inventoryService = buildInventoryService(db);

    const userContext = await authMiddleware.authenticateRequest(request, {
      requireSession: true,
      targetBranchId: branchId,
    });
    requireOperatorOrOwner(userContext);
    requireApplicationSession(userContext.session, userContext, branchId);
    requireBranchAccess(userContext, branchId);

    if (request.method === 'GET') {
      const components = await inventoryService.getProductComponents(productId, branchId);
      return successResponse(components, 200, responseHeaders);
    }

    if (request.method === 'PUT') {
      const rawBody = await request.json();
      const body = validateRequest(setBOMSchema, rawBody);
      const updated = await inventoryService.setProductComponents(productId, body.components, userContext.userId, branchId);
      return successResponse(updated, 200, responseHeaders);
    }

    throw new BadRequestError('Method not supported');
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}

/**
 * PATCH / PUT /api/v1/branches/:branchId/inventory/pricing
 * Update selling price, tax rate, and sub-tax rates (SGST, CGST, IGST) for a product.
 */
export async function handleUpdateInventoryPricingRoute(
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
    const inventoryService = buildInventoryService(db);

    const userContext = await authMiddleware.authenticateRequest(request, {
      requireSession: true,
      targetBranchId: branchId,
    });
    requireOperatorOrOwner(userContext);
    requireApplicationSession(userContext.session, userContext, branchId);
    requireBranchAccess(userContext, branchId);

    const rawBody = await request.json();
    const body = validateRequest(updatePricingSchema, rawBody);

    const updated = await inventoryService.updatePricingAndTaxes(
      branchId,
      body.productId,
      {
        selling_price: body.selling_price,
        tax_rate: body.tax_rate,
        cgst_rate: body.cgst_rate,
        sgst_rate: body.sgst_rate,
        igst_rate: body.igst_rate,
        serving_size: body.serving_size,
        price_rate: body.price_rate,
        serving_sizes_json: body.serving_sizes_json,
      },
      userContext.userId,
    );

    return successResponse(
      {
        message: 'Pricing and tax breakdown updated successfully',
        inventory: updated,
      },
      200,
      responseHeaders,
    );
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}

