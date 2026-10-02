import { handleBranchOrdersRoute } from '../../../../../api/routes/branch-orders.route';
import { CloudflareEnv } from '../../../../../database/types';

interface PagesFunctionEventContext<Env> {
  request: Request;
  env: Env;
  params: { id: string };
}

export async function onRequestGet(context: PagesFunctionEventContext<CloudflareEnv>): Promise<Response> {
  const branchId = context.params.id;
  return handleBranchOrdersRoute(context.request, branchId, context.env);
}

export async function onRequestPost(context: PagesFunctionEventContext<CloudflareEnv>): Promise<Response> {
  const branchId = context.params.id;
  return handleBranchOrdersRoute(context.request, branchId, context.env);
}

export async function onRequestOptions(context: PagesFunctionEventContext<CloudflareEnv>): Promise<Response> {
  const branchId = context.params.id;
  return handleBranchOrdersRoute(context.request, branchId, context.env);
}
