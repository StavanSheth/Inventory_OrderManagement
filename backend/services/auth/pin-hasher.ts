/**
 * Secure cryptographic PIN hasher using Web Crypto API (crypto.subtle PBKDF2).
 *
 * ARCHITECTURAL DECISION & RUNTIME CONSTRAINTS:
 * Cloudflare Workers and Edge runtimes do not natively support Argon2id without
 * bundling large third-party C/WASM packages which violate Worker CPU/bundle constraints.
 * Standard Web Crypto PBKDF2 with 100,000 iterations and SHA-256 is 100% native,
 * hardware-accelerated, and fully supported across Node.js 20+, Cloudflare Workers,
 * and browser runtimes.
 *
 * Never logs or stores plaintext PINs.
 */

const ITERATIONS = 100000;
const HASH_ALGO = 'SHA-256';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Validates that PIN is numeric only and between 4 and 8 digits.
 */
export function validatePinFormat(pin: string): void {
  if (!pin || typeof pin !== 'string') {
    throw new Error('PIN must be 4 to 8 numeric digits');
  }
  if (!/^\d{4,8}$/.test(pin.trim())) {
    throw new Error('PIN must be 4 to 8 numeric digits');
  }
}

/**
 * Hash a plaintext PIN with a secure cryptographic random salt.
 */
export async function hashPin(pin: string): Promise<string> {
  validatePinFormat(pin);

  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: HASH_ALGO,
    },
    keyMaterial,
    256,
  );

  const saltHex = toHex(salt);
  const hashHex = toHex(new Uint8Array(derivedBits));

  return `pbkdf2:sha256:${ITERATIONS}:${saltHex}:${hashHex}`;
}

/**
 * Verify a plaintext PIN against a stored pin_hash using constant-time comparison.
 */
export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  if (!pin || !storedHash) {
    return false;
  }

  const parts = storedHash.split(':');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2') {
    return false;
  }

  const [, , iterationsStr, saltHex, expectedHashHex] = parts;
  const iterations = parseInt(iterationsStr, 10);
  const salt = fromHex(saltHex);

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations,
      hash: HASH_ALGO,
    },
    keyMaterial,
    256,
  );

  const computedHashHex = toHex(new Uint8Array(derivedBits));

  // Constant-time string comparison
  if (computedHashHex.length !== expectedHashHex.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < computedHashHex.length; i++) {
    mismatch |= computedHashHex.charCodeAt(i) ^ expectedHashHex.charCodeAt(i);
  }

  return mismatch === 0;
}
