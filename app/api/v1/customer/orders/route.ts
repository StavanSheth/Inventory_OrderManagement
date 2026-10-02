import { handleCustomerOrdersRoute, handleCreateOrderRoute } from '@/api/routes/customer-orders.route';
import { CloudflareEnv } from '@/database/types';

export async function GET(request: Request) {
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleCustomerOrdersRoute(request, env);
}

export async function POST(request: Request) {
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleCreateOrderRoute(request, env);
}

export async function OPTIONS(request: Request) {
  return handleCustomerOrdersRoute(request);
}
