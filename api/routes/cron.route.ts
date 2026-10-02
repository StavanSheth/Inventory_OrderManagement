import { OrderRepository } from '../../database/repositories/order.repository';
import { AuditRepository } from '../../database/repositories/audit.repository';
import { OrderExpiryJob } from '../../backend/jobs/order-expiry.job';
import { realtimeService } from '../../backend/services/realtime';
import { successResponse } from '../serializers/response';
import { handleApiError } from '../middleware/error-handler';
import { D1DatabaseLike } from '../../database/types';
import { getDatabase } from '../../database/runtime';
import { CloudflareEnv } from '../../database/types';

/**
 * POST /api/v1/cron/expire-orders
 * Called by Cloudflare Cron Trigger (or system; protected against public calls in wrangler.jsonc).
 * Finds all PENDING orders past their expires_at and marks them EXPIRED.
 */
export async function handleOrderExpiryRoute(
  env?: { DB?: D1DatabaseLike } | CloudflareEnv,
): Promise<Response> {
  try {
    const db = getDatabase(env as { env?: CloudflareEnv } | CloudflareEnv | undefined);
    const job = new OrderExpiryJob(
      new OrderRepository(db),
      realtimeService,
      new AuditRepository(db),
    );
    const result = await job.processExpiredOrders();
    return successResponse({ ok: true, ...result }, 200);
  } catch (error) {
    return handleApiError(error);
  }
}
