import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hashPin, verifyPin } from '../../backend/services/auth/pin-hasher';

describe('PIN Hashing & Cryptographic Verification', () => {
  it('hashes a PIN securely using PBKDF2-SHA256 and never exposes plaintext', async () => {
    const rawPin = '4826';
    const hashed = await hashPin(rawPin);

    // Verify hashed format: pbkdf2:sha256:<iterations>:<salt>:<hash>
    assert.ok(hashed.startsWith('pbkdf2:sha256:'));
    assert.strictEqual(hashed.includes(rawPin), false, 'Plaintext PIN must never appear in hash');

    const parts = hashed.split(':');
    assert.strictEqual(parts.length, 5);
    assert.strictEqual(parts[2], '100000'); // 100k iterations
  });

  it('generates unique salts and hashes for the same PIN', async () => {
    const pin = '1234';
    const hash1 = await hashPin(pin);
    const hash2 = await hashPin(pin);

    assert.notStrictEqual(hash1, hash2, 'Hashes for identical PINs must differ due to unique salts');
  });

  it('correctly verifies valid PIN against stored hash', async () => {
    const pin = '9876';
    const hash = await hashPin(pin);

    const isValid = await verifyPin('9876', hash);
    assert.strictEqual(isValid, true);
  });

  it('rejects incorrect PIN against stored hash', async () => {
    const pin = '9876';
    const hash = await hashPin(pin);

    const isValid = await verifyPin('0000', hash);
    assert.strictEqual(isValid, false);
  });

  it('rejects short PINs below 4 digits', async () => {
    await assert.rejects(async () => {
      await hashPin('12');
    }, /PIN must be 4 to 8 numeric digits/);
  });

  it('rejects non-numeric characters in PIN', async () => {
    await assert.rejects(async () => {
      await hashPin('abcd');
    }, /PIN must be 4 to 8 numeric digits/);

    await assert.rejects(async () => {
      await hashPin('12ab');
    }, /PIN must be 4 to 8 numeric digits/);
  });

  it('rejects PINs longer than 8 digits', async () => {
    await assert.rejects(async () => {
      await hashPin('123456789');
    }, /PIN must be 4 to 8 numeric digits/);
  });

  it('accepts valid 4 to 8 digit numeric PINs', async () => {
    const hash4 = await hashPin('1234');
    const hash8 = await hashPin('12345678');
    assert.strictEqual(await verifyPin('1234', hash4), true);
    assert.strictEqual(await verifyPin('12345678', hash8), true);
  });

  it('handles invalid or empty hash strings gracefully', async () => {
    const res1 = await verifyPin('1234', '');
    assert.strictEqual(res1, false);

    const res2 = await verifyPin('1234', 'not-a-valid-hash');
    assert.strictEqual(res2, false);
  });
});
