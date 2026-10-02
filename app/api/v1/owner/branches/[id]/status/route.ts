import { NextRequest } from 'next/server';
import { handleUpdateBranchStatusRoute } from '@/api/routes/owner-branches.route';
import { CloudflareEnv } from '@/database/types';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleUpdateBranchStatusRoute(request, id, env);
}

export async function OPTIONS(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleUpdateBranchStatusRoute(request, id, env);
}
