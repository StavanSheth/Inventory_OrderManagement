import { handleValidateCouponRoute } from '@/api/routes/promotions.route';
import { CloudflareEnv } from '@/database/types';

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleValidateCouponRoute(request, id, env);
}

export async function OPTIONS(request: Request) {
  return handleValidateCouponRoute(request, '');
}
