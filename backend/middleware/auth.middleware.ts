import { FirebaseVerifier } from '../services/auth/firebase-verifier';
import { UserSyncService } from '../services/auth/user-sync.service';
import { SessionService } from '../services/auth/session.service';
import { AuthenticatedUserContext } from '../../shared/types/auth.types';
import { UnauthorizedError } from '../errors/app-error';

export interface AuthMiddlewareDependencies {
  firebaseVerifier: FirebaseVerifier;
  userSyncService: UserSyncService;
  sessionService?: SessionService;
}

export class AuthMiddleware {
  constructor(private deps: AuthMiddlewareDependencies) {}

  /**
   * Authenticates an incoming HTTP request.
   * Extracts Bearer token, verifies Firebase identity, resolves application user & role.
   * Optionally validates session token if provided.
   */
  async authenticateRequest(request: Request): Promise<AuthenticatedUserContext> {
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
    const userContext = await this.deps.userSyncService.resolveUserContext(syncResult.user.id);

    if (!userContext) {
      throw new UnauthorizedError('Could not establish application user context');
    }

    // 3. Optional: check x-session-token for PIN-verified sessions
    const sessionToken = request.headers.get('x-session-token');
    if (sessionToken && this.deps.sessionService) {
      try {
        const session = await this.deps.sessionService.validateSession(sessionToken);
        if (session.user_id === userContext.userId) {
          userContext.session = {
            id: session.id,
            scope: session.scope,
            branchId: session.branch_id,
            pinVerified: Boolean(session.pin_verified_at),
            expiresAt: session.expires_at,
          };
          if (session.branch_id) {
            userContext.activeBranchId = session.branch_id;
          }
        }
      } catch {
        // If session token is invalid/expired, throw UnauthorizedError
        throw new UnauthorizedError('Application session is invalid or expired');
      }
    }

    return userContext;
  }
}
