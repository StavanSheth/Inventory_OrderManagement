import { handleUpdateInventoryPricingRoute } from '@/api/routes/inventory.route';
import { CloudflareEnv } from '@/database/types';

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleUpdateInventoryPricingRoute(request, id, env);
}

export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleUpdateInventoryPricingRoute(request, id, env);
}

export async function OPTIONS(request: Request) {
  return handleUpdateInventoryPricingRoute(request, '');
}
