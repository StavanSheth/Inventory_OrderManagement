import { handleProductBOMRoute } from '@/api/routes/inventory.route';
import { CloudflareEnv } from '@/database/types';

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string; productId: string }> },
) {
  const { id, productId } = await props.params;
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleProductBOMRoute(request, id, productId, env);
}

export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string; productId: string }> },
) {
  const { id, productId } = await props.params;
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleProductBOMRoute(request, id, productId, env);
}

export async function OPTIONS(request: Request) {
  return handleProductBOMRoute(request, '', '');
}
