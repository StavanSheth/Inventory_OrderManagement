import { handleOrderExpiryRoute } from '@/api/routes/cron.route';
import { CloudflareEnv } from '@/database/types';

export async function POST(request: Request) {
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleOrderExpiryRoute(env, request);
}

export async function OPTIONS(request: Request) {
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleOrderExpiryRoute(env, request);
}
