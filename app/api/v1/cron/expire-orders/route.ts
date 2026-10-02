import { handleOrderExpiryRoute } from '@/api/routes/cron.route';
import { CloudflareEnv } from '@/database/types';

export async function POST(_request: Request) {
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleOrderExpiryRoute(env);
}

export async function OPTIONS(_request: Request) {
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleOrderExpiryRoute(env);
}
