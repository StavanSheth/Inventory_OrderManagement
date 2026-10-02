import { handleRealtimeEventsRoute } from '@/api/routes/realtime.route';
import { CloudflareEnv } from '@/database/types';

export async function GET(request: Request) {
  const env = (globalThis as unknown as { env?: CloudflareEnv }).env;
  return handleRealtimeEventsRoute(request, env);
}

export async function OPTIONS(request: Request) {
  return handleRealtimeEventsRoute(request);
}
