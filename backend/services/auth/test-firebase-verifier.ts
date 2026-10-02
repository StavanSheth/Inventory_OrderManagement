import { IFirebaseVerifier } from './firebase-verifier.interface';
import { FirebaseTokenPayload } from '../../../shared/types/auth.types';
import { UnauthorizedError } from '../../errors/app-error';

/**
 * Test Firebase Verifier.
 * Strictly forbidden in production environments.
 * Used exclusively for local tests and deterministic test fixtures.
 */
export class TestFirebaseVerifier implements IFirebaseVerifier {
  constructor() {
    if (process.env.NODE_ENV === 'production' || (process.env.NODE_ENV as string) === 'staging' || process.env.APP_ENV === 'staging') {
      throw new Error('FATAL: TestFirebaseVerifier cannot be used in production environment');
    }
  }

  async verifyIdToken(idToken: string): Promise<FirebaseTokenPayload> {
    if (!idToken || typeof idToken !== 'string' || idToken.trim().length === 0) {
      throw new UnauthorizedError('Authentication token is missing');
    }

    const trimmed = idToken.trim();

    if (trimmed.startsWith('mock-user:') || trimmed.startsWith('test-token:')) {
      const parts = trimmed.split(':');
      const uid = parts[1] ?? 'test-uid';
      const email = parts[2] ?? `${uid}@melt.local`;
      const name = parts[3] ?? 'Test User';
      return {
        uid,
        email,
        name,
        auth_time: Math.floor(Date.now() / 1000),
      };
    }

    // Also support base64 simulated JWT without cryptography for tests
    const segments = trimmed.split('.');
    if (segments.length === 3) {
      try {
        const payloadBase64 = segments[1].replace(/-/g, '+').replace(/_/g, '/');
        const json = Buffer.from(payloadBase64, 'base64').toString('utf-8');
        const payload = JSON.parse(json) as Record<string, unknown>;
        if (payload.sub && typeof payload.sub === 'string') {
          return {
            uid: payload.sub,
            email: typeof payload.email === 'string' ? payload.email : undefined,
            name: typeof payload.name === 'string' ? payload.name : undefined,
            auth_time: Math.floor(Date.now() / 1000),
            ...payload,
          };
        }
      } catch {
        // Fall through
      }
    }

    throw new UnauthorizedError('Invalid test authentication token');
  }
}
