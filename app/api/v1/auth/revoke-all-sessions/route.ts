import { handleRevokeAllSessions } from '@/api/routes/auth.route';
import { CloudflareEnv } from '@/database/types';

export async function POST(request: Request) {
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleRevokeAllSessions(request, env);
}

export async function OPTIONS(request: Request) {
  return handleRevokeAllSessions(request);
}
