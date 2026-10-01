import { HealthController } from '../controllers/health.controller';
import { successResponse } from '../serializers/response';
import { handleApiError } from '../middleware/error-handler';
import { extractRequestContext } from '../middleware/request-context';

export async function handleHealthRoute(request: Request): Promise<Response> {
  try {
    extractRequestContext(request);
    const health = HealthController.getHealth();
    return successResponse(health);
  } catch (error) {
    return handleApiError(error);
  }
}
