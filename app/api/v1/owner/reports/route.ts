import { NextRequest } from 'next/server';
import { handleOwnerReportsRoute } from '@/api/routes/reports.route';
import { CloudflareEnv } from '@/database/types';

export async function GET(request: NextRequest) {
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleOwnerReportsRoute(request, env);
}

export async function OPTIONS(request: NextRequest) {
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleOwnerReportsRoute(request, env);
}
