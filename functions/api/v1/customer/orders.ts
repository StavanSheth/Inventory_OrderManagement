import { handleCustomerOrdersRoute } from '../../../../api/routes/customer-orders.route';
import { CloudflareEnv } from '../../../../database/types';

interface PagesFunctionEventContext<Env> {
  request: Request;
  env: Env;
}

export async function onRequestGet(context: PagesFunctionEventContext<CloudflareEnv>): Promise<Response> {
  return handleCustomerOrdersRoute(context.request, context.env);
}

export async function onRequestOptions(context: PagesFunctionEventContext<CloudflareEnv>): Promise<Response> {
  return handleCustomerOrdersRoute(context.request, context.env);
}
