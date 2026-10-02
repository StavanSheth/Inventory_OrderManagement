import { D1DatabaseLike, CloudflareEnv } from '../../database/types';
import { getDatabase } from '../../database/runtime';
import { UserRepository } from '../../database/repositories/user.repository';
import { SessionRepository } from '../../database/repositories/session.repository';
import { IFirebaseVerifier } from '../../backend/services/auth/firebase-verifier.interface';
import { FirebaseProductionVerifier } from '../../backend/services/auth/firebase-verifier';
import { TestFirebaseVerifier } from '../../backend/services/auth/test-firebase-verifier';
import { UserSyncService } from '../../backend/services/auth/user-sync.service';
import { SessionService } from '../../backend/services/auth/session.service';
import { AuthMiddleware } from '../../backend/middleware/auth.middleware';
import { AuthController } from '../controllers/auth.controller';
import { config } from '../../config/runtime';

export interface AuthFactoryOptions {
  customVerifier?: IFirebaseVerifier;
}

export interface AuthInfrastructure {
  db: D1DatabaseLike;
  userRepo: UserRepository;
  sessionRepo: SessionRepository;
  firebaseVerifier: IFirebaseVerifier;
  userSyncService: UserSyncService;
  sessionService: SessionService;
  authMiddleware: AuthMiddleware;
  authController: AuthController;
}

/**
 * Creates authenticated services and middleware for a request.
 * In production, strictly binds FirebaseProductionVerifier.
 * In test environments or when explicitly injected, allows TestFirebaseVerifier.
 */
export function createAuthInfrastructure(
  envOrDb?: { env?: CloudflareEnv } | CloudflareEnv | D1DatabaseLike,
  options: AuthFactoryOptions = {},
): AuthInfrastructure {
  const db = (envOrDb && 'prepare' in envOrDb)
    ? (envOrDb as D1DatabaseLike)
    : getDatabase(envOrDb as { env?: CloudflareEnv } | CloudflareEnv | undefined);

  const userRepo = new UserRepository(db);
  const sessionRepo = new SessionRepository(db);

  // Verifier selection
  let verifier: IFirebaseVerifier;
  const isProductionLike = process.env.NODE_ENV === 'production' || (process.env.NODE_ENV as string) === 'staging' || process.env.APP_ENV === 'staging';

  if (options.customVerifier) {
    if (isProductionLike && options.customVerifier instanceof TestFirebaseVerifier) {
      throw new Error('FATAL: TestFirebaseVerifier cannot be used in production or staging environments');
    }
    verifier = options.customVerifier;
  } else if (process.env.NODE_ENV === 'test' && !process.env.FORCE_PRODUCTION_VERIFIER) {
    verifier = new TestFirebaseVerifier();
  } else {
    const projectId = config.firebase.projectId ?? process.env.FIREBASE_PROJECT_ID;
    if (!projectId || projectId.trim().length === 0) {
      if (isProductionLike) {
        throw new Error('Firebase projectId is required in production and staging environments');
      }
      verifier = new TestFirebaseVerifier();
    } else {
      verifier = new FirebaseProductionVerifier(projectId);
    }
  }

  const userSyncService = new UserSyncService(userRepo, db);
  const sessionService = new SessionService(sessionRepo, userRepo, db);
  const authMiddleware = new AuthMiddleware({
    firebaseVerifier: verifier,
    userSyncService,
    sessionService,
  });
  const authController = new AuthController(userSyncService, sessionService, userRepo, sessionRepo);

  return {
    db,
    userRepo,
    sessionRepo,
    firebaseVerifier: verifier,
    userSyncService,
    sessionService,
    authMiddleware,
    authController,
  };
}
