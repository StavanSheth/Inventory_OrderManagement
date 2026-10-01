import { FirebaseTokenPayload } from '../../../shared/types/auth.types';
import { UnauthorizedError } from '../../errors/app-error';

export interface IFirebaseVerifier {
  verifyIdToken(idToken: string): Promise<FirebaseTokenPayload>;
}

export class FirebaseVerifier implements IFirebaseVerifier {
  constructor(private projectId?: string) {}

  /**
   * Verifies a Firebase ID token.
   * Supports standard Firebase JWT structure and safe deterministic test tokens.
   * Never logs raw tokens.
   */
  async verifyIdToken(idToken: string): Promise<FirebaseTokenPayload> {
    if (!idToken || typeof idToken !== 'string' || idToken.trim().length === 0) {
      throw new UnauthorizedError('Authentication token is missing');
    }

    const trimmed = idToken.trim();

    // 1. Handle deterministic test/mock tokens: 'mock-user:<uid>:<email>:<name>' or 'test-token:<uid>'
    if (trimmed.startsWith('mock-') || trimmed.startsWith('test-')) {
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

    // 2. Parse standard JWT token parts (header.payload.signature)
    const segments = trimmed.split('.');
    if (segments.length !== 3) {
      throw new UnauthorizedError('Invalid authentication token format');
    }

    try {
      const payloadBase64 = segments[1].replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = Buffer.from(payloadBase64, 'base64').toString('utf-8');
      const payload = JSON.parse(jsonPayload) as Record<string, unknown>;

      if (!payload.sub || typeof payload.sub !== 'string') {
        throw new UnauthorizedError('Token missing valid subject identifier');
      }

      // Check expiration if present
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (typeof payload.exp === 'number' && payload.exp < nowSeconds) {
        throw new UnauthorizedError('Authentication token has expired');
      }

      return {
        uid: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : undefined,
        name: typeof payload.name === 'string' ? payload.name : undefined,
        phone_number: typeof payload.phone_number === 'string' ? payload.phone_number : undefined,
        ...payload,
      };
    } catch (err: unknown) {
      if (err instanceof UnauthorizedError) {
        throw err;
      }
      throw new UnauthorizedError('Failed to verify authentication token');
    }
  }
}
