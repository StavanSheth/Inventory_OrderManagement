import { handleAuthLogin } from '@/api/routes/auth.route';
import { CloudflareEnv } from '@/database/types';

export async function POST(request: Request) {
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleAuthLogin(request, env);
}

export async function OPTIONS(request: Request) {
  return handleAuthLogin(request);
}
