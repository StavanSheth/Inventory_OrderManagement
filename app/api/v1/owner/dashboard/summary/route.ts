import { NextRequest } from 'next/server';
import { handleDashboardSummaryRoute } from '@/api/routes/dashboard.route';
import { CloudflareEnv } from '@/database/types';

export async function GET(request: NextRequest) {
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleDashboardSummaryRoute(request, env);
}

export async function OPTIONS(request: NextRequest) {
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleDashboardSummaryRoute(request, env);
}
