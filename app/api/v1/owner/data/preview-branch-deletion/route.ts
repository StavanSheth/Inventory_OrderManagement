import { NextRequest } from 'next/server';
import { handlePreviewBranchDeletionRoute } from '@/api/routes/data-management.route';
import { CloudflareEnv } from '@/database/types';

export async function POST(request: NextRequest) {
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handlePreviewBranchDeletionRoute(request, env);
}

export async function OPTIONS(request: NextRequest) {
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handlePreviewBranchDeletionRoute(request, env);
}
