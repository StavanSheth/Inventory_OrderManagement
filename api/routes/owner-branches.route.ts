import { z } from 'zod';
import { createAuthInfrastructure, AuthFactoryOptions } from '../factories/auth.factory';
import { BranchesService } from '../../backend/services/branches';
import { BranchRepository } from '../../database/repositories/branch.repository';
import { AuditRepository } from '../../database/repositories/audit.repository';
import { successResponse } from '../serializers/response';
import { handleApiError } from '../middleware/error-handler';
import { validateRequest } from '../validators/request.validator';
import { requireOwner, requireOperatorOrOwner } from '../../backend/policies/role.policy';
import { requireBranchAccess, requireApplicationSession } from '../../backend/policies/branch-access.policy';
import { handleCorsPreflight, getCorsHeaders } from '../middleware/cors';
import { config } from '../../config/runtime';
import { D1DatabaseLike } from '../../database/types';
import { BranchStatus } from '../../shared/enums/branch.enum';
import { UserRole } from '../../shared/enums/roles.enum';

const createBranchSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  code: z.string().min(1, 'Code is required').max(20),
  address: z.string().max(255).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email().optional().nullable(),
  timezone: z.string().max(50).optional(),
  status: z.nativeEnum(BranchStatus).optional(),
});

const updateBranchSchema = createBranchSchema.partial();

const updateSettingsSchema = z.object({
  session_timeout_value: z.number().int().positive().optional(),
  session_timeout_unit: z.enum(['MINUTES', 'HOURS', 'DAYS']).optional(),
  order_expiry_minutes: z.number().int().positive().optional(),
  order_edit_window_minutes: z.number().int().positive().optional(),
  configuration_json: z.string().optional(),
});

const statusSchema = z.object({
  status: z.nativeEnum(BranchStatus),
});

export async function handleListOwnerBranchesRoute(
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

    // Strictly Owner only
    requireOwner(userContext);

    const branchRepo = new BranchRepository(db);
    const auditRepo = new AuditRepository(db);
    const branchesService = new BranchesService(branchRepo, db, auditRepo);

    const branches = await branchesService.listBranches();
    const withSettings = await Promise.all(
      branches.map(async (b) => {
        const settings = await branchRepo.getBranchSettings(b.id);
        return { ...b, settings };
      }),
    );

    return successResponse(withSettings, 200, corsHeaders);
  } catch (error) {
    return handleApiError(error, corsHeaders);
  }
}

export async function handleCreateBranchRoute(
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

    // Strictly Owner only
    requireOwner(userContext);

    const rawBody = await request.json();
    const body = validateRequest(createBranchSchema, rawBody);
    const branchRepo = new BranchRepository(db);
    const auditRepo = new AuditRepository(db);
    const branchesService = new BranchesService(branchRepo, db, auditRepo);

    const created = await branchesService.createBranch(userContext.userId, body);
    return successResponse(created, 201, corsHeaders);
  } catch (error) {
    return handleApiError(error, corsHeaders);
  }
}

export async function handleGetBranchDetailRoute(
  request: Request,
  branchId: string,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(request, config.allowedOrigins);

  try {
    const { db, authMiddleware } = createAuthInfrastructure(env, options);
    const userContext = await authMiddleware.authenticateRequest(request, { requireSession: false });

    requireOperatorOrOwner(userContext);
    if (userContext.role === UserRole.BRANCH_OPERATOR) {
      requireApplicationSession(userContext.session, userContext, branchId);
      requireBranchAccess(userContext, branchId);
    }

    const branchRepo = new BranchRepository(db);
    const auditRepo = new AuditRepository(db);
    const branchesService = new BranchesService(branchRepo, db, auditRepo);

    const detail = await branchesService.getBranchDetail(branchId);
    if (!detail) {
      return successResponse(null, 404, corsHeaders);
    }

    return successResponse(detail, 200, corsHeaders);
  } catch (error) {
    return handleApiError(error, corsHeaders);
  }
}

export async function handleUpdateBranchRoute(
  request: Request,
  branchId: string,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(request, config.allowedOrigins);

  try {
    const { db, authMiddleware } = createAuthInfrastructure(env, options);
    const userContext = await authMiddleware.authenticateRequest(request, { requireSession: false });

    // Strictly Owner only
    requireOwner(userContext);

    const rawBody = await request.json();
    const body = validateRequest(updateBranchSchema, rawBody);
    const branchRepo = new BranchRepository(db);
    const auditRepo = new AuditRepository(db);
    const branchesService = new BranchesService(branchRepo, db, auditRepo);

    const updated = await branchesService.updateBranch(userContext.userId, branchId, body);
    return successResponse(updated, 200, corsHeaders);
  } catch (error) {
    return handleApiError(error, corsHeaders);
  }
}

export async function handleUpdateBranchStatusRoute(
  request: Request,
  branchId: string,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(request, config.allowedOrigins);

  try {
    const { db, authMiddleware } = createAuthInfrastructure(env, options);
    const userContext = await authMiddleware.authenticateRequest(request, { requireSession: false });

    // Strictly Owner only
    requireOwner(userContext);

    const rawBody = await request.json();
    const body = validateRequest(statusSchema, rawBody);
    const branchRepo = new BranchRepository(db);
    const auditRepo = new AuditRepository(db);
    const branchesService = new BranchesService(branchRepo, db, auditRepo);

    const updated = await branchesService.setBranchStatus(userContext.userId, branchId, body.status);
    return successResponse(updated, 200, corsHeaders);
  } catch (error) {
    return handleApiError(error, corsHeaders);
  }
}

export async function handleGetBranchSettingsRoute(
  request: Request,
  branchId: string,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(request, config.allowedOrigins);

  try {
    const { db, authMiddleware } = createAuthInfrastructure(env, options);
    const userContext = await authMiddleware.authenticateRequest(request, { requireSession: false });

    requireOperatorOrOwner(userContext);
    if (userContext.role === UserRole.BRANCH_OPERATOR) {
      requireApplicationSession(userContext.session, userContext, branchId);
      requireBranchAccess(userContext, branchId);
    }

    const branchRepo = new BranchRepository(db);
    let settings = await branchRepo.getBranchSettings(branchId);
    if (!settings) {
      settings = await branchRepo.createDefaultSettings(branchId);
    }

    return successResponse({ settings }, 200, corsHeaders);
  } catch (error) {
    return handleApiError(error, corsHeaders);
  }
}

export async function handleUpdateBranchSettingsRoute(
  request: Request,
  branchId: string,
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
    const body = validateRequest(updateSettingsSchema, rawBody);
    const branchRepo = new BranchRepository(db);
    const auditRepo = new AuditRepository(db);
    const branchesService = new BranchesService(branchRepo, db, auditRepo);

    const updated = await branchesService.updateBranchSettings(userContext.userId, branchId, body);
    return successResponse({ settings: updated }, 200, corsHeaders);
  } catch (error) {
    return handleApiError(error, corsHeaders);
  }
}
