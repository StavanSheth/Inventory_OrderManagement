import { handleVerifyPaymentRoute } from '@/api/routes/branch-orders.route';
import { CloudflareEnv } from '@/database/types';

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string; orderId: string; paymentId: string }> },
) {
  const { id, orderId, paymentId } = await props.params;
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleVerifyPaymentRoute(request, id, orderId, paymentId, env);
}

export async function OPTIONS(
  request: Request,
  props: { params: Promise<{ id: string; orderId: string; paymentId: string }> },
) {
  const { id, orderId, paymentId } = await props.params;
  return handleVerifyPaymentRoute(request, id, orderId, paymentId);
}
