import { handleCreateRawMaterialRoute } from '@/api/routes/inventory.route';
import { CloudflareEnv } from '@/database/types';

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleCreateRawMaterialRoute(request, id, env);
}

export async function OPTIONS(request: Request) {
  return handleCreateRawMaterialRoute(request, '');
}
