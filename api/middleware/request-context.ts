import { AuthenticatedUserContext } from '../../shared/types/auth.types';

export interface RequestContext {
  requestId: string;
  timestamp: string;
  userAgent?: string | null;
  clientIp?: string | null;
  userContext?: AuthenticatedUserContext | null;
}

export function extractRequestContext(request: Request, userContext?: AuthenticatedUserContext | null): RequestContext {
  const headers = request.headers;
  const requestId = headers.get('x-request-id') ?? `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    requestId,
    timestamp: new Date().toISOString(),
    userAgent: headers.get('user-agent'),
    clientIp: headers.get('x-forwarded-for') ?? headers.get('cf-connecting-ip'),
    userContext: userContext ?? null,
  };
}
