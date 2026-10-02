import { createAuthInfrastructure, AuthFactoryOptions } from '../factories/auth.factory';
import { BranchRepository } from '../../database/repositories/branch.repository';
import { BranchStatus } from '../../shared/enums/branch.enum';
import { successResponse } from '../serializers/response';
import { handleApiError } from '../middleware/error-handler';
import { handleCorsPreflight, getCorsHeaders } from '../middleware/cors';
import { config } from '../../config/runtime';
import { D1DatabaseLike } from '../../database/types';

/**
 * GET /api/v1/branches
 * Returns active branches for customer ordering and operator selection.
 * Public catalog discovery - no authentication required.
 */
export async function handleListBranchesRoute(
  request: Request,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(request, config.allowedOrigins);

  try {
    const { db } = createAuthInfrastructure(env, options);
    const branchRepo = new BranchRepository(db);
    const branches = await branchRepo.listAll(BranchStatus.ACTIVE);

    return successResponse(
      branches.map((b) => ({
        id: b.id,
        name: b.name,
        code: b.code,
        status: b.status,
        address: b.address,
        phone: b.phone,
      })),
      200,
      corsHeaders,
    );
  } catch (error) {
    return handleApiError(error, corsHeaders);
  }
}
