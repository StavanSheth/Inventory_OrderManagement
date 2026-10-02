import { z } from 'zod';
import { createAuthInfrastructure, AuthFactoryOptions } from '../factories/auth.factory';
import { DeletionService } from '../../backend/services/deletion';
import { successResponse } from '../serializers/response';
import { handleApiError } from '../middleware/error-handler';
import { validateRequest } from '../validators/request.validator';
import { requireOwner } from '../../backend/policies/role.policy';
import { handleCorsPreflight, getCorsHeaders } from '../middleware/cors';
import { config } from '../../config/runtime';
import { D1DatabaseLike } from '../../database/types';

const previewDeletionSchema = z.object({
  branchId: z.string().min(1, 'Branch ID is required'),
});

const deactivateBranchSchema = z.object({
  branchId: z.string().min(1, 'Branch ID is required'),
});

const anonymizeCustomerSchema = z.object({
  customerUserId: z.string().min(1, 'Customer User ID is required'),
  reason: z.string().max(255).optional(),
});

export async function handlePreviewBranchDeletionRoute(
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

    // Owner only
    requireOwner(userContext);

    const rawBody = await request.json();
    const body = validateRequest(previewDeletionSchema, rawBody);
    const deletionService = new DeletionService(db);
    const preview = await deletionService.previewBranchDeletion(body.branchId);

    return successResponse(preview, 200, corsHeaders);
  } catch (error) {
    return handleApiError(error, corsHeaders);
  }
}

export async function handleDeactivateBranchRoute(
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

    // Owner only
    requireOwner(userContext);

    const rawBody = await request.json();
    const body = validateRequest(deactivateBranchSchema, rawBody);
    const deletionService = new DeletionService(db);
    const result = await deletionService.deactivateBranch(userContext.userId, body.branchId);

    return successResponse(result, 200, corsHeaders);
  } catch (error) {
    return handleApiError(error, corsHeaders);
  }
}

export async function handleAnonymizeCustomerRoute(
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

    // Owner only
    requireOwner(userContext);

    const rawBody = await request.json();
    const body = validateRequest(anonymizeCustomerSchema, rawBody);
    const deletionService = new DeletionService(db);
    const result = await deletionService.anonymizeCustomer(userContext.userId, body.customerUserId, body.reason);

    return successResponse(result, 200, corsHeaders);
  } catch (error) {
    return handleApiError(error, corsHeaders);
  }
}
