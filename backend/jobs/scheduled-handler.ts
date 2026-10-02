import { OrderExpiryJob } from '../../backend/jobs/order-expiry.job';
import { OrderRepository } from '../../database/repositories/order.repository';
import { AuditRepository } from '../../database/repositories/audit.repository';
import { createRealtimeService } from '../../backend/services/realtime';
import { CloudflareEnv } from '../../database/types';

/**
 * Cloudflare Worker Scheduled Handler
 * Invoked by Cloudflare cron triggers ("* * * * *") defined in wrangler.jsonc
 */
export async function handleScheduledEvent(
  _event: { scheduledTime: number; cron: string },
  env: CloudflareEnv,
): Promise<{ expiredCount: number }> {
  if (!env?.DB) {
    throw new Error('D1 database binding DB is not available in environment');
  }

  const orderRepo = new OrderRepository(env.DB);
  const auditRepo = new AuditRepository(env.DB);
  const realtime = createRealtimeService(env.DB);

  const job = new OrderExpiryJob(orderRepo, realtime, auditRepo);
  return job.processExpiredOrders();
}
