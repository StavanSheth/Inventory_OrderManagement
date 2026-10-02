import { handleAdjustInventoryRoute } from '@/api/routes/inventory.route';
import { CloudflareEnv } from '@/database/types';

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleAdjustInventoryRoute(request, id, env);
}

export async function OPTIONS(request: Request) {
  return handleAdjustInventoryRoute(request, '');
}
