export function isOriginAllowed(origin: string | null, allowedOrigins: string[]): boolean {
  if (!origin) return false;
  return allowedOrigins.includes(origin);
}

export function getCorsHeaders(
  request: Request,
  allowedOrigins: string[],
): Record<string, string> {
  const origin = request.headers.get('origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-request-id',
    'Access-Control-Max-Age': '86400',
  };

  if (origin && isOriginAllowed(origin, allowedOrigins)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  } else if (allowedOrigins.length > 0 && !allowedOrigins.some((o) => o.includes('localhost'))) {
    // In production without origin match, omit Allow-Origin header
  } else if (allowedOrigins.length > 0) {
    // Development fallback
    headers['Access-Control-Allow-Origin'] = allowedOrigins[0];
  }

  return headers;
}

export function handleCorsPreflight(
  request: Request,
  allowedOrigins: string[],
): Response | null {
  if (request.method !== 'OPTIONS') {
    return null;
  }

  const corsHeaders = getCorsHeaders(request, allowedOrigins);
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}
