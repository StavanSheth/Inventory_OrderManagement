import { handleCustomerOrderDetailRoute } from '@/api/routes/customer-orders.route';
import { CloudflareEnv } from '@/database/types';

export async function GET(
  request: Request,
  props: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await props.params;
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleCustomerOrderDetailRoute(request, orderId, env);
}

export async function OPTIONS(
  request: Request,
  props: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await props.params;
  return handleCustomerOrderDetailRoute(request, orderId);
}
