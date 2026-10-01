import { createAuthInfrastructure, AuthFactoryOptions } from '../factories/auth.factory';
import { ProductRepository } from '../../database/repositories/product.repository';
import { successResponse } from '../serializers/response';
import { handleApiError } from '../middleware/error-handler';
import { extractRequestContext } from '../middleware/request-context';
import { handleCorsPreflight, getCorsHeaders } from '../middleware/cors';
import { config } from '../../config/runtime';
import { D1DatabaseLike } from '../../database/types';

/**
 * GET /api/v1/branches/:branchId/catalog
 * Public product catalog for a branch (no auth required for browsing).
 * Returns categories and products grouped by category.
 */
export async function handleBranchCatalogRoute(
  request: Request,
  branchId: string,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(request, config.allowedOrigins);
  const context = extractRequestContext(request);
  const responseHeaders = { ...corsHeaders, 'x-request-id': context.requestId };

  try {
    const { db } = createAuthInfrastructure(env, options);
    const productRepo = new ProductRepository(db);

    const [categories, products] = await Promise.all([
      productRepo.listCategoriesByBranch(branchId, true),
      productRepo.listByBranch(branchId, true),
    ]);

    // Group products by category
    const productsByCategory = new Map(categories.map((c) => [c.id, { category: c, products: [] as typeof products }]));
    for (const product of products) {
      const bucket = productsByCategory.get(product.category_id);
      if (bucket) bucket.products.push(product);
    }

    return successResponse(
      {
        branchId,
        catalog: Array.from(productsByCategory.values()),
      },
      200,
      responseHeaders,
    );
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}
