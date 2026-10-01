import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../config/runtime';

describe('Configuration & Environment Validation', () => {
  it('loads valid default development configuration', () => {
    const conf = loadConfig({});
    assert.strictEqual(conf.environment, 'development');
    assert.strictEqual(conf.port, 3000);
    assert.strictEqual(conf.apiBaseUrl, 'http://localhost:3000');
    assert.deepStrictEqual(conf.allowedOrigins, ['http://localhost:3000']);
    assert.strictEqual(conf.d1BindingName, 'DB');
    assert.strictEqual(conf.featureFlags.enableDummyWhatsApp, true);
    assert.strictEqual(conf.featureFlags.enableCoupons, true);
    assert.strictEqual(conf.featureFlags.enableRealtime, false);
  });

  it('correctly parses custom production environment variables', () => {
    const conf = loadConfig({
      NODE_ENV: 'production',
      PORT: '8080',
      API_BASE_URL: 'https://api.melt.example.com',
      ALLOWED_ORIGINS: 'https://melt.example.com, https://admin.melt.example.com',
      D1_BINDING_NAME: 'PRODUCTION_DB',
      FIREBASE_PROJECT_ID: 'melt-prod-123',
      ENABLE_REALTIME: 'true',
    });

    assert.strictEqual(conf.environment, 'production');
    assert.strictEqual(conf.port, 8080);
    assert.strictEqual(conf.apiBaseUrl, 'https://api.melt.example.com');
    assert.deepStrictEqual(conf.allowedOrigins, [
      'https://melt.example.com',
      'https://admin.melt.example.com',
    ]);
    assert.strictEqual(conf.d1BindingName, 'PRODUCTION_DB');
    assert.strictEqual(conf.firebase.projectId, 'melt-prod-123');
    assert.strictEqual(conf.featureFlags.enableRealtime, true);
  });

  it('rejects invalid environment values', () => {
    assert.throws(
      () => {
        loadConfig({ NODE_ENV: 'invalid-environment' });
      },
      /invalid_value|invalid_enum_value/i,
    );
  });

  it('rejects production configuration with localhost apiBaseUrl', () => {
    assert.throws(
      () => {
        loadConfig({
          NODE_ENV: 'production',
          API_BASE_URL: 'http://localhost:3000',
          ALLOWED_ORIGINS: 'https://melt.example.com',
        });
      },
      /Production\/staging cannot use localhost apiBaseUrl/i,
    );
  });

  it('rejects production configuration with localhost allowedOrigins', () => {
    assert.throws(
      () => {
        loadConfig({
          NODE_ENV: 'production',
          API_BASE_URL: 'https://api.melt.example.com',
          ALLOWED_ORIGINS: 'https://melt.example.com, http://localhost:3000',
        });
      },
      /Production\/staging allowedOrigins cannot contain localhost/i,
    );
  });

  it('rejects production configuration without allowedOrigins defined', () => {
    assert.throws(
      () => {
        loadConfig({
          NODE_ENV: 'production',
          API_BASE_URL: 'https://api.melt.example.com',
        });
      },
      /Production\/staging must define at least one allowed origin/i,
    );
  });
});
