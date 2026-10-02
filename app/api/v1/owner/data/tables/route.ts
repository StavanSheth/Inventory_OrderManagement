import { NextRequest } from 'next/server';
import { handleGetTablesDataRoute, handleDeleteTablesDataRoute } from '@/api/routes/data-management.route';
import { CloudflareEnv } from '@/database/types';

export async function GET(request: NextRequest) {
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleGetTablesDataRoute(request, env);
}

export async function DELETE(request: NextRequest) {
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleDeleteTablesDataRoute(request, env);
}

export async function OPTIONS(request: NextRequest) {
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleGetTablesDataRoute(request, env);
}
