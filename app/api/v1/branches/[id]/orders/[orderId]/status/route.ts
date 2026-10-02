import { handleBranchOrderStatusRoute } from '@/api/routes/branch-orders.route';
import { CloudflareEnv } from '@/database/types';

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string; orderId: string }> },
) {
  const { id, orderId } = await props.params;
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleBranchOrderStatusRoute(request, id, orderId, env);
}

export async function OPTIONS(
  request: Request,
  props: { params: Promise<{ id: string; orderId: string }> },
) {
  const { id, orderId } = await props.params;
  return handleBranchOrderStatusRoute(request, id, orderId);
}
