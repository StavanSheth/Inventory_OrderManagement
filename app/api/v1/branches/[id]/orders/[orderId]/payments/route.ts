import { handleRecordPaymentRoute } from '@/api/routes/branch-orders.route';
import { CloudflareEnv } from '@/database/types';

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string; orderId: string }> },
) {
  const { id, orderId } = await props.params;
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleRecordPaymentRoute(request, id, orderId, env);
}

export async function OPTIONS(
  request: Request,
  props: { params: Promise<{ id: string; orderId: string }> },
) {
  const { id, orderId } = await props.params;
  return handleRecordPaymentRoute(request, id, orderId);
}
