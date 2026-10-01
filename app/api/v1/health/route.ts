import { handleHealthRoute } from '@/api/routes/health.route';
import { CloudflareEnv } from '@/database/types';

export async function GET(request: Request) {
  // In Next-on-Pages / Cloudflare Workers, process.env or globalThis may contain env bindings
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleHealthRoute(request, env);
}

export async function OPTIONS(request: Request) {
  return handleHealthRoute(request);
}
