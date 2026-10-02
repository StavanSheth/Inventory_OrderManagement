import { NextRequest } from 'next/server';
import { handleOwnerMarketingCustomersRoute } from '@/api/routes/marketing.route';
import { CloudflareEnv } from '@/database/types';

export async function GET(request: NextRequest) {
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleOwnerMarketingCustomersRoute(request, env);
}

export async function OPTIONS(request: NextRequest) {
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleOwnerMarketingCustomersRoute(request, env);
}
