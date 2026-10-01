import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { FirebaseProductionVerifier } from '../../backend/services/auth/firebase-verifier';
import { UnauthorizedError } from '../../backend/errors/app-error';

function base64UrlEncode(objOrStr: object | string): string {
  const str = typeof objOrStr === 'string' ? objOrStr : JSON.stringify(objOrStr);
  return Buffer.from(str).toString('base64url');
}

describe('FirebaseProductionVerifier (RS256 Web Crypto Verification)', () => {
  let privateKey: CryptoKey;
  let publicJwk: Record<string, unknown>;
  const projectId = 'melt-icecream';
  const kid = 'google-cert-key-1';

  before(async () => {
    // Generate deterministic RSA-2048 key pair using Web Crypto API
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );

    privateKey = keyPair.privateKey;
    const jwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    publicJwk = {
      ...jwk,
      kid,
      alg: 'RS256',
      use: 'sig',
    };
  });

  async function createToken(headerOverrides: Record<string, unknown> = {}, payloadOverrides: Record<string, unknown> = {}): Promise<string> {
    const header = {
      alg: 'RS256',
      kid,
      ...headerOverrides,
    };

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: 'google_uid_987654',
      iss: `https://securetoken.google.com/${projectId}`,
      aud: projectId,
      exp: now + 3600,
      iat: now,
      auth_time: now,
      email: 'verified.user@gmail.com',
      name: 'Verified User',
      firebase: { sign_in_provider: 'google.com' },
      ...payloadOverrides,
    };

    const h = base64UrlEncode(header);
    const p = base64UrlEncode(payload);
    const data = new TextEncoder().encode(`${h}.${p}`);
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, data);
    const s = Buffer.from(sig).toString('base64url');

    return `${h}.${p}.${s}`;
  }

  function getVerifier() {
    return new FirebaseProductionVerifier({
      projectId,
      customJwks: [publicJwk as unknown as { kty: string; alg: string; use: string; kid: string; n: string; e: string }],
    });
  }

  it('successfully verifies genuine RS256 token and returns payload', async () => {
    const verifier = getVerifier();
    const token = await createToken();

    const payload = await verifier.verifyIdToken(token);
    assert.strictEqual(payload.uid, 'google_uid_987654');
    assert.strictEqual(payload.email, 'verified.user@gmail.com');
    assert.strictEqual(payload.name, 'Verified User');
  });

  it('rejects tokens with mock- or test- prefix without bypass', async () => {
    const verifier = getVerifier();
    await assert.rejects(async () => {
      await verifier.verifyIdToken('mock-user:123:test@melt.local');
    }, UnauthorizedError);

    await assert.rejects(async () => {
      await verifier.verifyIdToken('test-token:123');
    }, UnauthorizedError);
  });

  it('rejects missing or empty token', async () => {
    const verifier = getVerifier();
    await assert.rejects(async () => {
      await verifier.verifyIdToken('');
    }, UnauthorizedError);
  });

  it('rejects malformed token structure not having 3 segments', async () => {
    const verifier = getVerifier();
    await assert.rejects(async () => {
      await verifier.verifyIdToken('header.payload');
    }, UnauthorizedError);
  });

  it('rejects unsupported algorithm in header', async () => {
    const verifier = getVerifier();
    const token = await createToken({ alg: 'HS256' });
    await assert.rejects(async () => {
      await verifier.verifyIdToken(token);
    }, (err: Error) => err.message.includes('Expected RS256'));
  });

  it('rejects header missing kid', async () => {
    const verifier = getVerifier();
    const token = await createToken({ kid: undefined });
    await assert.rejects(async () => {
      await verifier.verifyIdToken(token);
    }, (err: Error) => err.message.includes('missing key identifier'));
  });

  it('rejects unknown kid not present in JWKS', async () => {
    const verifier = getVerifier();
    const token = await createToken({ kid: 'unknown-key-id' });
    await assert.rejects(async () => {
      await verifier.verifyIdToken(token);
    }, (err: Error) => err.message.includes('not found in JWKS'));
  });

  it('rejects invalid signature when payload was tampered with', async () => {
    const verifier = getVerifier();
    const token = await createToken();
    const segments = token.split('.');
    // Tamper with payload
    const tamperedPayload = base64UrlEncode({ sub: 'hacked_uid' });
    const tamperedToken = `${segments[0]}.${tamperedPayload}.${segments[2]}`;

    await assert.rejects(async () => {
      await verifier.verifyIdToken(tamperedToken);
    }, (err: Error) => err.message.includes('signature verification failed'));
  });

  it('rejects token with wrong issuer', async () => {
    const verifier = getVerifier();
    const token = await createToken({}, { iss: 'https://securetoken.google.com/wrong-project' });
    await assert.rejects(async () => {
      await verifier.verifyIdToken(token);
    }, (err: Error) => err.message.includes('Invalid token issuer'));
  });

  it('rejects token with wrong audience', async () => {
    const verifier = getVerifier();
    const token = await createToken({}, { aud: 'wrong-audience' });
    await assert.rejects(async () => {
      await verifier.verifyIdToken(token);
    }, (err: Error) => err.message.includes('Invalid token audience'));
  });

  it('rejects expired token', async () => {
    const verifier = getVerifier();
    const now = Math.floor(Date.now() / 1000);
    const token = await createToken({}, { exp: now - 600 }); // Expired 10 min ago
    await assert.rejects(async () => {
      await verifier.verifyIdToken(token);
    }, (err: Error) => err.message.includes('expired'));
  });

  it('rejects token with missing or invalid iat', async () => {
    const verifier = getVerifier();
    const token = await createToken({}, { iat: undefined });
    await assert.rejects(async () => {
      await verifier.verifyIdToken(token);
    }, (err: Error) => err.message.includes('missing or invalid issued-at time (iat)'));
  });

  it('rejects token with future iat', async () => {
    const verifier = getVerifier();
    const now = Math.floor(Date.now() / 1000);
    const token = await createToken({}, { iat: now + 500 });
    await assert.rejects(async () => {
      await verifier.verifyIdToken(token);
    }, (err: Error) => err.message.includes('Token issued in the future'));
  });

  it('rejects token with iat after exp', async () => {
    const verifier = getVerifier();
    const now = Math.floor(Date.now() / 1000);
    const token = await createToken({}, { exp: now + 100, iat: now + 200 });
    await assert.rejects(async () => {
      await verifier.verifyIdToken(token);
    }, (err: Error) => err.message.includes('Token issued-at time is after expiration time'));
  });

  it('rejects token with missing or invalid auth_time', async () => {
    const verifier = getVerifier();
    const token = await createToken({}, { auth_time: undefined });
    await assert.rejects(async () => {
      await verifier.verifyIdToken(token);
    }, (err: Error) => err.message.includes('missing or invalid authentication time (auth_time)'));
  });

  it('rejects token with future auth_time', async () => {
    const verifier = getVerifier();
    const now = Math.floor(Date.now() / 1000);
    const token = await createToken({}, { auth_time: now + 500 });
    await assert.rejects(async () => {
      await verifier.verifyIdToken(token);
    }, (err: Error) => err.message.includes('Token authentication time is in the future'));
  });

  it('rejects token with unsupported authentication provider (non-google)', async () => {
    const verifier = getVerifier();
    const token = await createToken({}, {
      firebase: {
        sign_in_provider: 'password',
      },
    });
    await assert.rejects(async () => {
      await verifier.verifyIdToken(token);
    }, (err: Error) => err.message.includes('Only Google authentication is permitted'));
  });

  it('accepts token with google.com sign_in_provider', async () => {
    const verifier = getVerifier();
    const token = await createToken({}, {
      firebase: {
        sign_in_provider: 'google.com',
      },
    });
    const payload = await verifier.verifyIdToken(token);
    assert.strictEqual(payload.uid, 'google_uid_987654');
  });
});
