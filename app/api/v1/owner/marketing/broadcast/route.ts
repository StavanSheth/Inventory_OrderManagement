import { NextRequest } from 'next/server';
import { handleOwnerMarketingBroadcastRoute } from '@/api/routes/marketing.route';
import { CloudflareEnv } from '@/database/types';

export async function POST(request: NextRequest) {
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleOwnerMarketingBroadcastRoute(request, env);
}

export async function OPTIONS(request: NextRequest) {
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleOwnerMarketingBroadcastRoute(request, env);
}
