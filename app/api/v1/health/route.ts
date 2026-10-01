import { handleHealthRoute } from '@/api/routes/health.route';

export async function GET(request: Request) {
  return handleHealthRoute(request);
}
