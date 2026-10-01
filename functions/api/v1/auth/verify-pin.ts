import { handleVerifyPin } from '../../../../api/routes/auth.route';
import { CloudflareEnv } from '../../../../database/types';

interface PagesFunctionEventContext<Env> {
  request: Request;
  env: Env;
}

export async function onRequestPost(context: PagesFunctionEventContext<CloudflareEnv>): Promise<Response> {
  return handleVerifyPin(context.request, context.env);
}

export async function onRequestOptions(context: PagesFunctionEventContext<CloudflareEnv>): Promise<Response> {
  return handleVerifyPin(context.request, context.env);
}
