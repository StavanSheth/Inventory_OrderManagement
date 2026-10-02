import { createAuthInfrastructure, AuthFactoryOptions } from '../factories/auth.factory';
import { DashboardService } from '../../backend/services/dashboard';
import { successResponse } from '../serializers/response';
import { handleApiError } from '../middleware/error-handler';
import { requireOperatorOrOwner } from '../../backend/policies/role.policy';
import { requireApplicationSession } from '../../backend/policies/branch-access.policy';
import { handleCorsPreflight, getCorsHeaders } from '../middleware/cors';
import { config } from '../../config/runtime';
import { D1DatabaseLike } from '../../database/types';
import { UserRole } from '../../shared/enums/roles.enum';
import { ForbiddenError } from '../../backend/errors/app-error';

/**
 * GET /api/v1/owner/dashboard/summary
 * Authoritative aggregated dashboard metrics for Owner & Branch Operator.
 * - Owner: can view all branches or filter by specific branch.
 * - Operator: strictly scoped to assigned branch.
 */
export async function handleDashboardSummaryRoute(
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

    // 1. Role Authorization: Owner or Operator only
    requireOperatorOrOwner(userContext);

    const url = new URL(request.url);
    const requestedBranchId = url.searchParams.get('branchId') ?? undefined;
    const preset = (url.searchParams.get('preset') as 'today' | 'week' | 'month' | 'custom') || 'today';
    const startDate = url.searchParams.get('startDate') ?? undefined;
    const endDate = url.searchParams.get('endDate') ?? undefined;

    let effectiveBranchId = requestedBranchId;

    // 2. Branch Scoping
    if (userContext.role === UserRole.BRANCH_OPERATOR) {
      requireApplicationSession(userContext.session, userContext);
      if (userContext.session?.scope !== 'GLOBAL' && requestedBranchId && requestedBranchId !== userContext.session?.branchId) {
        throw new ForbiddenError('Operators cannot access metrics for another branch');
      }
      effectiveBranchId = userContext.session?.branchId ?? undefined;
    }

    const dashboardService = new DashboardService(db);
    const summary = await dashboardService.getSummary({
      branchId: effectiveBranchId,
      preset,
      startDate,
      endDate,
    });

    return successResponse(summary, 200, corsHeaders);
  } catch (error) {
    return handleApiError(error, corsHeaders);
  }
}
