import { AuthController } from '../controllers/auth.controller';
import { AuthMiddleware } from '../../backend/middleware/auth.middleware';
import { FirebaseVerifier } from '../../backend/services/auth/firebase-verifier';
import { UserSyncService } from '../../backend/services/auth/user-sync.service';
import { SessionService } from '../../backend/services/auth/session.service';
import { UserRepository } from '../../database/repositories/user.repository';
import { SessionRepository } from '../../database/repositories/session.repository';
import { successResponse } from '../serializers/response';
import { handleApiError } from '../middleware/error-handler';
import { extractRequestContext } from '../middleware/request-context';
import { handleCorsPreflight, getCorsHeaders } from '../middleware/cors';
import { config } from '../../config/runtime';
import { D1DatabaseLike } from '../../database/types';
import { getDatabase } from '../../database/runtime';
import { BadRequestError } from '../../backend/errors/app-error';

function buildAuthServices(db: D1DatabaseLike) {
  const userRepo = new UserRepository(db);
  const sessionRepo = new SessionRepository(db);
  const firebaseVerifier = new FirebaseVerifier(config.firebase.projectId);
  const userSyncService = new UserSyncService(userRepo, db);
  const sessionService = new SessionService(sessionRepo, userRepo, db);
  const authMiddleware = new AuthMiddleware({
    firebaseVerifier,
    userSyncService,
    sessionService,
  });
  const controller = new AuthController(userSyncService, sessionService, userRepo);

  return { authMiddleware, controller };
}

export async function handleAuthLogin(request: Request, env?: { DB?: D1DatabaseLike }): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(request, config.allowedOrigins);
  const context = extractRequestContext(request);
  const responseHeaders = { ...corsHeaders, 'x-request-id': context.requestId };

  try {
    const db = getDatabase(env);
    const { authMiddleware, controller } = buildAuthServices(db);

    const userContext = await authMiddleware.authenticateRequest(request);
    const data = await controller.login(userContext);

    return successResponse(data, 200, responseHeaders);
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}

export async function handleSetPin(request: Request, env?: { DB?: D1DatabaseLike }): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(request, config.allowedOrigins);
  const context = extractRequestContext(request);
  const responseHeaders = { ...corsHeaders, 'x-request-id': context.requestId };

  try {
    const db = getDatabase(env);
    const { authMiddleware, controller } = buildAuthServices(db);

    const userContext = await authMiddleware.authenticateRequest(request);
    const body = (await request.json().catch(() => ({}))) as { pin?: string };

    const data = await controller.setPin(userContext, { pin: body.pin ?? '' });
    return successResponse(data, 200, responseHeaders);
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}

export async function handleVerifyPin(request: Request, env?: { DB?: D1DatabaseLike }): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(request, config.allowedOrigins);
  const context = extractRequestContext(request);
  const responseHeaders = { ...corsHeaders, 'x-request-id': context.requestId };

  try {
    const db = getDatabase(env);
    const { authMiddleware, controller } = buildAuthServices(db);

    const userContext = await authMiddleware.authenticateRequest(request);
    const body = (await request.json().catch(() => ({}))) as {
      pin?: string;
      branchId?: string;
      scope?: 'BRANCH' | 'GLOBAL';
    };

    if (!body.pin) {
      throw new BadRequestError('PIN is required');
    }

    const data = await controller.verifyPin(userContext, {
      pin: body.pin,
      branchId: body.branchId,
      scope: body.scope,
    });
    return successResponse(data, 200, responseHeaders);
  } catch (error) {
    return handleApiError(error, responseHeaders);
  }
}
