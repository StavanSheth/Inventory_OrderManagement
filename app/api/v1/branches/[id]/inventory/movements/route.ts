import { handleGetMovementsRoute } from '@/api/routes/inventory.route';
import { CloudflareEnv } from '@/database/types';

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleGetMovementsRoute(request, id, env);
}

export async function OPTIONS(request: Request) {
  return handleGetMovementsRoute(request, '');
}
