import { IFirebaseVerifier } from '../services/auth/firebase-verifier.interface';
import { UserSyncService } from '../services/auth/user-sync.service';
import { SessionService } from '../services/auth/session.service';
import { AuthenticatedUserContext } from '../../shared/types/auth.types';
import { UnauthorizedError, ForbiddenError } from '../errors/app-error';

export interface AuthMiddlewareDependencies {
  firebaseVerifier: IFirebaseVerifier;
  userSyncService: UserSyncService;
  sessionService?: SessionService;
}

export interface AuthenticateRequestOptions {
  requireSession?: boolean;
  targetBranchId?: string;
}

export class AuthMiddleware {
  constructor(private deps: AuthMiddlewareDependencies) {}

  /**
   * Authenticates an incoming HTTP request.
   * Extracts Bearer token, verifies Firebase identity, resolves application user & role.
   * Optionally enforces and validates application session token if required or provided.
   */
  async authenticateRequest(
    request: Request,
    options: AuthenticateRequestOptions = {},
  ): Promise<AuthenticatedUserContext> {
    const authHeader = request.headers.get('authorization') ?? request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authorization header missing or invalid');
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      throw new UnauthorizedError('Bearer token is empty');
    }

    // 1. Verify token with Firebase verifier
    const firebasePayload = await this.deps.firebaseVerifier.verifyIdToken(token);

    // 2. Synchronize / resolve application user
    const syncResult = await this.deps.userSyncService.syncUser(firebasePayload);

    // Reject inactive or suspended application accounts
    if (syncResult.user.status !== 'ACTIVE') {
      throw new ForbiddenError('User account is inactive or suspended');
    }

    const userContext = await this.deps.userSyncService.resolveUserContext(syncResult.user.id);

    if (!userContext) {
      throw new UnauthorizedError('Could not establish application user context');
    }

    // 3. Application Session (PIN session) handling
    const sessionToken = request.headers.get('x-session-token');

    if (options.requireSession && !sessionToken) {
      throw new UnauthorizedError('Application PIN session is required for this operation');
    }

    if (sessionToken && this.deps.sessionService) {
      try {
        const session = await this.deps.sessionService.validateSession(sessionToken);
        if (session.user_id !== userContext.userId) {
          throw new ForbiddenError('Application session does not belong to the authenticated user');
        }

        userContext.session = {
          id: session.id,
          user_id: session.user_id,
          scope: session.scope,
          branchId: session.branch_id,
          pinVerified: Boolean(session.pin_verified_at),
          expiresAt: session.expires_at,
        };

        if (session.branch_id) {
          userContext.activeBranchId = session.branch_id;
        }
      } catch (err) {
        if (err instanceof ForbiddenError || err instanceof UnauthorizedError) {
          throw err;
        }
        throw new UnauthorizedError('Application session is invalid or expired');
      }
    }

    return userContext;
  }
}
