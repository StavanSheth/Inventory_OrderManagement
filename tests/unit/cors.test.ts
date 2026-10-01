import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isOriginAllowed, getCorsHeaders, handleCorsPreflight } from '../../api/middleware/cors';

describe('CORS & Request Middleware', () => {
  const allowedOrigins = ['https://melt.example.com', 'https://admin.melt.example.com'];

  it('validates allowed origins accurately', () => {
    assert.strictEqual(isOriginAllowed('https://melt.example.com', allowedOrigins), true);
    assert.strictEqual(isOriginAllowed('https://admin.melt.example.com', allowedOrigins), true);
    assert.strictEqual(isOriginAllowed('https://evil.example.com', allowedOrigins), false);
    assert.strictEqual(isOriginAllowed(null, allowedOrigins), false);
  });

  it('injects CORS headers when origin matches allowed list', () => {
    const request = new Request('https://api.melt.example.com/api/v1/health', {
      headers: { Origin: 'https://melt.example.com' },
    });

    const headers = getCorsHeaders(request, allowedOrigins);
    assert.strictEqual(headers['Access-Control-Allow-Origin'], 'https://melt.example.com');
    assert.strictEqual(headers['Vary'], 'Origin');
    assert.ok(headers['Access-Control-Allow-Methods'].includes('GET'));
  });

  it('handles OPTIONS preflight requests returning 204 No Content', () => {
    const request = new Request('https://api.melt.example.com/api/v1/health', {
      method: 'OPTIONS',
      headers: { Origin: 'https://melt.example.com' },
    });

    const response = handleCorsPreflight(request, allowedOrigins);
    assert.ok(response);
    assert.strictEqual(response.status, 204);
    assert.strictEqual(response.headers.get('Access-Control-Allow-Origin'), 'https://melt.example.com');
  });

  it('returns null for non-OPTIONS requests in preflight handler', () => {
    const request = new Request('https://api.melt.example.com/api/v1/health', {
      method: 'GET',
    });

    const response = handleCorsPreflight(request, allowedOrigins);
    assert.strictEqual(response, null);
  });
});
