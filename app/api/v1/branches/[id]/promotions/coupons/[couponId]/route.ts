import { handleSingleCouponRoute } from '@/api/routes/promotions.route';
import { CloudflareEnv } from '@/database/types';

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string; couponId: string }> },
) {
  const { id, couponId } = await props.params;
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleSingleCouponRoute(request, id, couponId, env);
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string; couponId: string }> },
) {
  const { id, couponId } = await props.params;
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleSingleCouponRoute(request, id, couponId, env);
}

export async function OPTIONS(request: Request) {
  return handleSingleCouponRoute(request, '', '');
}
