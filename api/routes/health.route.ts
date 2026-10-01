import { HealthController } from '../controllers/health.controller';
import { successResponse } from '../serializers/response';
import { handleApiError } from '../middleware/error-handler';
import { extractRequestContext } from '../middleware/request-context';
import { handleCorsPreflight, getCorsHeaders } from '../middleware/cors';
import { config } from '../../config/runtime';
import { D1DatabaseLike } from '../../database/types';

export async function handleHealthRoute(
  request: Request,
  env?: { DB?: D1DatabaseLike },
): Promise<Response> {
  // 1. Handle CORS preflight
  const preflightResponse = handleCorsPreflight(request, config.allowedOrigins);
  if (preflightResponse) {
    return preflightResponse;
  }

  const corsHeaders = getCorsHeaders(request, config.allowedOrigins);
  const context = extractRequestContext(request);

  const responseHeaders = {
    ...corsHeaders,
    'x-request-id': context.requestId,
  };

  try {
    const isDbBound = Boolean(env?.DB);
    const health = HealthController.getHealth(isDbBound);
    return successResponse(health, 200, responseHeaders);
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}
