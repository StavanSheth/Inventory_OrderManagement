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
  env?: { DB?: D1DatabaseLike; CRON_SECRET?: string } | CloudflareEnv,
  request?: Request,
): Promise<Response> {
  try {
    const cronSecret = (env && 'CRON_SECRET' in env ? (env as { CRON_SECRET?: string }).CRON_SECRET : undefined) ?? process.env.CRON_SECRET;
    if (cronSecret && request) {
      const authHeader = request.headers.get('authorization');
      const cronHeader = request.headers.get('x-cron-secret');
      const expectedBearer = `Bearer ${cronSecret}`;
      if (authHeader !== expectedBearer && cronHeader !== cronSecret) {
        return new Response(
          JSON.stringify({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Invalid or missing cron authentication secret' },
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }
    }

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
