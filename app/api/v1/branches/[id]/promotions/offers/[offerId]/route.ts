import { handleSingleOfferRoute } from '@/api/routes/promotions.route';
import { CloudflareEnv } from '@/database/types';

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string; offerId: string }> },
) {
  const { id, offerId } = await props.params;
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleSingleOfferRoute(request, id, offerId, env);
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string; offerId: string }> },
) {
  const { id, offerId } = await props.params;
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleSingleOfferRoute(request, id, offerId, env);
}

export async function OPTIONS(request: Request) {
  return handleSingleOfferRoute(request, '', '');
}
