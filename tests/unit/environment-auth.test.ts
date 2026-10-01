import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TestFirebaseVerifier } from '../../backend/services/auth/test-firebase-verifier';
import { FirebaseProductionVerifier } from '../../backend/services/auth/firebase-verifier';
import { loadConfig } from '../../config/runtime';

describe('Environment & Auth Security Rules', () => {
  it('strictly forbids TestFirebaseVerifier instantiation in production environment', () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      assert.throws(() => {
        new TestFirebaseVerifier();
      }, (err: Error) => err.message.includes('cannot be used in production environment'));
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
    }
  });

  it('requires non-empty projectId for FirebaseProductionVerifier', () => {
    assert.throws(() => {
      new FirebaseProductionVerifier('');
    }, (err: Error) => err.message.includes('requires a non-empty projectId'));
  });

  it('fails production configuration when Firebase project ID is missing', () => {
    assert.throws(() => {
      loadConfig({
        NODE_ENV: 'production',
        API_BASE_URL: 'https://api.melt.example.com',
        ALLOWED_ORIGINS: 'https://app.melt.example.com',
        // Missing FIREBASE_PROJECT_ID
      });
    }, (err: Error) => err.message.includes('require a non-empty Firebase projectId'));
  });

  it('succeeds when all production requirements including Firebase projectId are provided', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      API_BASE_URL: 'https://api.melt.example.com',
      ALLOWED_ORIGINS: 'https://app.melt.example.com',
      FIREBASE_PROJECT_ID: 'melt-icecream-prod',
    });

    assert.strictEqual(config.environment, 'production');
    assert.strictEqual(config.firebase.projectId, 'melt-icecream-prod');
  });
});
