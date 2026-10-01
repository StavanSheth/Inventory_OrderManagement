import { IFirebaseVerifier } from './firebase-verifier.interface';
import { FirebaseTokenPayload } from '../../../shared/types/auth.types';
import { UnauthorizedError } from '../../errors/app-error';

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const CLOCK_TOLERANCE_SECONDS = 300; // 5 minutes leeway for clock skew

interface GoogleJwk {
  kty: string;
  alg: string;
  use: string;
  kid: string;
  n: string;
  e: string;
}

interface JwksResponse {
  keys: GoogleJwk[];
}

export interface FirebaseProductionVerifierOptions {
  projectId: string;
  jwksUrl?: string;
  customJwks?: GoogleJwk[];
  cacheTtlMs?: number;
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (base64.length % 4)) % 4;
  const padded = base64 + '='.repeat(padLen);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Production Firebase ID Token Verifier using native Web Crypto API (RS256).
 * Compatible with Cloudflare Workers runtime and Node.js.
 * Fully verifies cryptographic signature, issuer, audience, and expiration.
 * Contains ZERO mock or test token bypasses.
 */
export class FirebaseProductionVerifier implements IFirebaseVerifier {
  private projectId: string;
  private jwksUrl: string;
  private customJwks?: GoogleJwk[];
  private cacheTtlMs: number;
  private cachedKeys: Map<string, { key: CryptoKey; expiresAt: number }> = new Map();

  constructor(options: FirebaseProductionVerifierOptions | string) {
    if (typeof options === 'string') {
      this.projectId = options;
      this.jwksUrl = GOOGLE_JWKS_URL;
      this.cacheTtlMs = 3600 * 1000;
    } else {
      this.projectId = options.projectId;
      this.jwksUrl = options.jwksUrl ?? GOOGLE_JWKS_URL;
      this.customJwks = options.customJwks;
      this.cacheTtlMs = options.cacheTtlMs ?? 3600 * 1000;
    }

    if (!this.projectId || this.projectId.trim().length === 0) {
      throw new Error('FirebaseProductionVerifier requires a non-empty projectId');
    }
  }

  async verifyIdToken(idToken: string): Promise<FirebaseTokenPayload> {
    if (!idToken || typeof idToken !== 'string' || idToken.trim().length === 0) {
      throw new UnauthorizedError('Authentication token is missing');
    }

    const trimmed = idToken.trim();

    // Explicit rejection of mock/test prefix attempts in production verifier
    if (trimmed.startsWith('mock-') || trimmed.startsWith('test-')) {
      throw new UnauthorizedError('Invalid authentication token format');
    }

    const segments = trimmed.split('.');
    if (segments.length !== 3) {
      throw new UnauthorizedError('Invalid authentication token structure');
    }

    const [headerB64, payloadB64, signatureB64] = segments;

    // 1. Decode Header
    let header: { alg?: string; kid?: string };
    try {
      const headerJson = atob(headerB64.replace(/-/g, '+').replace(/_/g, '/'));
      header = JSON.parse(headerJson);
    } catch {
      throw new UnauthorizedError('Invalid authentication token header');
    }

    if (header.alg !== 'RS256') {
      throw new UnauthorizedError(`Unsupported algorithm: ${header.alg ?? 'unknown'}. Expected RS256`);
    }

    if (!header.kid || typeof header.kid !== 'string') {
      throw new UnauthorizedError('Token header missing key identifier (kid)');
    }

    // 2. Decode Payload
    let payload: Record<string, unknown>;
    try {
      const payloadJson = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
      payload = JSON.parse(payloadJson);
    } catch {
      throw new UnauthorizedError('Invalid authentication token payload');
    }

    // 3. Verify Signature via Web Crypto
    const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signature = base64UrlToUint8Array(signatureB64);
    const cryptoKey = await this.getSigningKey(header.kid);

    const isSignatureValid = await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      cryptoKey,
      signature as unknown as BufferSource,
      signedData as unknown as BufferSource,
    );

    if (!isSignatureValid) {
      throw new UnauthorizedError('Token signature verification failed');
    }

    // 4. Validate Claims
    const nowSeconds = Math.floor(Date.now() / 1000);

    // Subject
    if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length === 0 || payload.sub.length > 128) {
      throw new UnauthorizedError('Token missing or invalid subject identifier (sub)');
    }

    // Issuer: must be https://securetoken.google.com/<projectId>
    const expectedIssuer = `https://securetoken.google.com/${this.projectId}`;
    if (payload.iss !== expectedIssuer) {
      throw new UnauthorizedError(`Invalid token issuer: ${payload.iss ?? 'none'}. Expected ${expectedIssuer}`);
    }

    // Audience: must be <projectId>
    if (payload.aud !== this.projectId) {
      throw new UnauthorizedError(`Invalid token audience: ${payload.aud ?? 'none'}. Expected ${this.projectId}`);
    }

    // Expiration
    if (typeof payload.exp !== 'number' || payload.exp <= (nowSeconds - CLOCK_TOLERANCE_SECONDS)) {
      throw new UnauthorizedError('Authentication token has expired');
    }

    // Issued At (strictly required)
    if (typeof payload.iat !== 'number' || payload.iat <= 0) {
      throw new UnauthorizedError('Token missing or invalid issued-at time (iat)');
    }
    if (payload.iat > (nowSeconds + CLOCK_TOLERANCE_SECONDS)) {
      throw new UnauthorizedError('Token issued in the future');
    }
    if (payload.iat > payload.exp) {
      throw new UnauthorizedError('Token issued-at time is after expiration time');
    }

    // Auth Time (strictly required)
    if (typeof payload.auth_time !== 'number' || payload.auth_time <= 0) {
      throw new UnauthorizedError('Token missing or invalid authentication time (auth_time)');
    }
    if (payload.auth_time > (nowSeconds + CLOCK_TOLERANCE_SECONDS)) {
      throw new UnauthorizedError('Token authentication time is in the future');
    }

    // 5. Enforce Google authentication server-side: explicitly require sign_in_provider === "google.com"
    const firebaseClaim = payload.firebase as { sign_in_provider?: string } | undefined;
    if (!firebaseClaim || firebaseClaim.sign_in_provider !== 'google.com') {
      throw new UnauthorizedError(
        `Unsupported authentication provider: "${firebaseClaim?.sign_in_provider ?? 'none'}". Only Google authentication is permitted.`,
      );
    }

    // Never trust role, branch, permissions from token payload
    return {
      uid: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      phone_number: typeof payload.phone_number === 'string' ? payload.phone_number : undefined,
      auth_time: typeof payload.auth_time === 'number' ? payload.auth_time : nowSeconds,
      email_verified: typeof payload.email_verified === 'boolean' ? payload.email_verified : undefined,
    };
  }

  private async getSigningKey(kid: string): Promise<CryptoKey> {
    const cached = this.cachedKeys.get(kid);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.key;
    }

    const jwks = await this.fetchJwks();
    const matchingJwk = jwks.find((k) => k.kid === kid);

    if (!matchingJwk) {
      throw new UnauthorizedError(`Public key with kid "${kid}" not found in JWKS`);
    }

    try {
      const cryptoKey = await crypto.subtle.importKey(
        'jwk',
        matchingJwk,
        {
          name: 'RSASSA-PKCS1-v1_5',
          hash: 'SHA-256',
        },
        false,
        ['verify'],
      );

      this.cachedKeys.set(kid, {
        key: cryptoKey,
        expiresAt: Date.now() + this.cacheTtlMs,
      });

      return cryptoKey;
    } catch {
      throw new UnauthorizedError(`Failed to import public key for kid "${kid}"`);
    }
  }

  private async fetchJwks(): Promise<GoogleJwk[]> {
    if (this.customJwks && this.customJwks.length > 0) {
      return this.customJwks;
    }

    try {
      const res = await fetch(this.jwksUrl);
      if (!res.ok) {
        throw new Error(`JWKS fetch responded with HTTP ${res.status}`);
      }
      const data = (await res.json()) as JwksResponse;
      return data.keys ?? [];
    } catch (err) {
      throw new UnauthorizedError(`Failed to retrieve Firebase signing keys: ${err instanceof Error ? err.message : 'network error'}`);
    }
  }
}

// Keep FirebaseVerifier as alias for FirebaseProductionVerifier
export const FirebaseVerifier = FirebaseProductionVerifier;
