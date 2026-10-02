import { NextRequest } from 'next/server';
import { handleListBranchesRoute } from '@/api/routes/branches.route';
import { CloudflareEnv } from '@/database/types';

export async function GET(request: NextRequest) {
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleListBranchesRoute(request, env);
}

export async function OPTIONS(request: NextRequest) {
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleListBranchesRoute(request, env);
}
