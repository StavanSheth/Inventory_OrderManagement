import { NextRequest } from 'next/server';
import { handleGetBranchDetailRoute, handleUpdateBranchRoute } from '@/api/routes/owner-branches.route';
import { CloudflareEnv } from '@/database/types';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleGetBranchDetailRoute(request, id, env);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleUpdateBranchRoute(request, id, env);
}

export async function OPTIONS(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleGetBranchDetailRoute(request, id, env);
}
