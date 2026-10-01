import { createAuthInfrastructure, AuthFactoryOptions } from '../factories/auth.factory';
import { successResponse } from '../serializers/response';
import { handleApiError } from '../middleware/error-handler';
import { extractRequestContext } from '../middleware/request-context';
import { handleCorsPreflight, getCorsHeaders } from '../middleware/cors';
import { config } from '../../config/runtime';
import { D1DatabaseLike } from '../../database/types';
import { checkRateLimit } from '../middleware/rate-limiter';
import { BadRequestError } from '../../backend/errors/app-error';

export async function handleAuthLogin(
  request: Request,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(request, config.allowedOrigins);
  const context = extractRequestContext(request);
  const responseHeaders = { ...corsHeaders, 'x-request-id': context.requestId };

  try {
    checkRateLimit(request, { keyPrefix: 'auth:login', maxRequests: 60 });
    const { authMiddleware, authController } = createAuthInfrastructure(env, options);

    const userContext = await authMiddleware.authenticateRequest(request);
    const data = await authController.login(userContext);

    return successResponse(data, 200, responseHeaders);
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}

export async function handleSetPin(
  request: Request,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(request, config.allowedOrigins);
  const context = extractRequestContext(request);
  const responseHeaders = { ...corsHeaders, 'x-request-id': context.requestId };

  try {
    checkRateLimit(request, { keyPrefix: 'auth:pin', maxRequests: 30 });
    const { authMiddleware, authController } = createAuthInfrastructure(env, options);

    const userContext = await authMiddleware.authenticateRequest(request);
    const body = (await request.json().catch(() => ({}))) as { pin?: string };

    const data = await authController.setPin(userContext, { pin: body.pin ?? '' });
    return successResponse(data, 200, responseHeaders);
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}

export async function handleVerifyPin(
  request: Request,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(request, config.allowedOrigins);
  const context = extractRequestContext(request);
  const responseHeaders = { ...corsHeaders, 'x-request-id': context.requestId };

  try {
    checkRateLimit(request, { keyPrefix: 'auth:verify-pin', maxRequests: 30 });
    const { authMiddleware, authController } = createAuthInfrastructure(env, options);

    const userContext = await authMiddleware.authenticateRequest(request);
    const body = (await request.json().catch(() => ({}))) as {
      pin?: string;
      branchId?: string;
      scope?: 'BRANCH' | 'GLOBAL';
    };

    if (!body.pin) {
      throw new BadRequestError('PIN is required');
    }

    const data = await authController.verifyPin(userContext, {
      pin: body.pin,
      branchId: body.branchId,
      scope: body.scope,
    });
    return successResponse(data, 200, responseHeaders);
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}

export async function handleRevokeSession(
  request: Request,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(request, config.allowedOrigins);
  const context = extractRequestContext(request);
  const responseHeaders = { ...corsHeaders, 'x-request-id': context.requestId };

  try {
    const { authMiddleware, authController } = createAuthInfrastructure(env, options);

    const userContext = await authMiddleware.authenticateRequest(request, { requireSession: false });
    const body = (await request.json().catch(() => ({}))) as { sessionId?: string };

    const data = await authController.revokeSession(userContext, body.sessionId);
    return successResponse(data, 200, responseHeaders);
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}

export async function handleRevokeAllSessions(
  request: Request,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(request, config.allowedOrigins);
  const context = extractRequestContext(request);
  const responseHeaders = { ...corsHeaders, 'x-request-id': context.requestId };

  try {
    const { authMiddleware, authController } = createAuthInfrastructure(env, options);

    const userContext = await authMiddleware.authenticateRequest(request, { requireSession: false });
    const data = await authController.revokeAllSessions(userContext);
    return successResponse(data, 200, responseHeaders);
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}
