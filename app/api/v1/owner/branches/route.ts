import { NextRequest } from 'next/server';
import { handleListOwnerBranchesRoute, handleCreateBranchRoute } from '@/api/routes/owner-branches.route';
import { CloudflareEnv } from '@/database/types';

export async function GET(request: NextRequest) {
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleListOwnerBranchesRoute(request, env);
}

export async function POST(request: NextRequest) {
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleCreateBranchRoute(request, env);
}

export async function OPTIONS(request: NextRequest) {
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleListOwnerBranchesRoute(request, env);
}
