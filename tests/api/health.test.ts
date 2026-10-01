import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleHealthRoute } from '../../api/routes/health.route';
import { handleApiError } from '../../api/middleware/error-handler';
import { NotFoundError, ValidationError } from '../../backend/errors/app-error';
import { ApiErrorCode } from '../../shared/enums/errors.enum';
import { HTTP_STATUS } from '../../shared/constants/api.constants';
import { createMemoryD1Database } from '../../database/adapter.sqlite';

describe('API Foundation & Health Check', () => {
  it('GET /api/v1/health returns standard success envelope and x-request-id header', async () => {
    const request = new Request('http://localhost:3000/api/v1/health', {
      method: 'GET',
      headers: {
        'x-request-id': 'custom-req-abc-123',
      },
    });

    const response = await handleHealthRoute(request);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get('content-type'), 'application/json');
    assert.strictEqual(response.headers.get('x-request-id'), 'custom-req-abc-123');

    const json = (await response.json()) as { success: boolean; data: { status: string; version?: string } };
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.data.status, 'ok');
    assert.strictEqual(json.data.version, '1.0.0');
  });

  it('GET /api/v1/health indicates database connection when DB binding is present', async () => {
    const db = createMemoryD1Database();
    const request = new Request('http://localhost:3000/api/v1/health', {
      method: 'GET',
    });

    const response = await handleHealthRoute(request, { DB: db });
    assert.strictEqual(response.status, 200);

    const json = (await response.json()) as { success: boolean; data: { status: string; database?: string } };
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.data.database, 'connected');
  });

  it('OPTIONS /api/v1/health returns 204 preflight with CORS headers', async () => {
    const request = new Request('http://localhost:3000/api/v1/health', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
      },
    });

    const response = await handleHealthRoute(request);
    assert.strictEqual(response.status, 204);
    assert.ok(response.headers.get('Access-Control-Allow-Methods'));
  });

  it('serializes NotFoundError into standard error envelope', async () => {
    const error = new NotFoundError('Branch not found', { branchId: 'br-unknown' });
    const response = handleApiError(error);

    assert.strictEqual(response.status, HTTP_STATUS.NOT_FOUND);
    const json = (await response.json()) as {
      success: boolean;
      error: { code: string; message: string; details?: unknown };
    };

    assert.strictEqual(json.success, false);
    assert.strictEqual(json.error.code, ApiErrorCode.NOT_FOUND);
    assert.strictEqual(json.error.message, 'Branch not found');
    assert.deepStrictEqual(json.error.details, { branchId: 'br-unknown' });
  });

  it('serializes ValidationError into standard error envelope', async () => {
    const error = new ValidationError('Invalid request payload', [
      { path: 'price', message: 'Price must be positive' },
    ]);
    const response = handleApiError(error);

    assert.strictEqual(response.status, HTTP_STATUS.BAD_REQUEST);
    const json = (await response.json()) as {
      success: boolean;
      error: { code: string; message: string; details?: unknown };
    };

    assert.strictEqual(json.success, false);
    assert.strictEqual(json.error.code, ApiErrorCode.VALIDATION_ERROR);
    assert.strictEqual(json.error.message, 'Invalid request payload');
  });

  it('handles unexpected errors gracefully without leaking stack traces or internal secrets', async () => {
    const error = new Error('Database password /root/secret failed');
    const response = handleApiError(error);

    assert.strictEqual(response.status, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    const json = (await response.json()) as {
      success: boolean;
      error: { code: string; message: string; details?: unknown };
    };

    assert.strictEqual(json.success, false);
    assert.strictEqual(json.error.code, ApiErrorCode.INTERNAL_ERROR);
    assert.strictEqual(json.error.details, undefined, 'Internal details must not be exposed');
  });

  it('proves Cloudflare Pages Functions runtime handler functions/api/v1/health.ts executes with env.DB', async () => {
    const { onRequestGet } = await import('../../functions/api/v1/health');
    const db = createMemoryD1Database();
    const request = new Request('https://melt.pages.dev/api/v1/health', {
      method: 'GET',
      headers: { 'x-request-id': 'cf-pages-req-1' },
    });

    const response = await onRequestGet({
      request,
      env: { DB: db },
      params: {},
      waitUntil: () => {},
      next: async () => new Response(),
      data: {},
    });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get('x-request-id'), 'cf-pages-req-1');
    const json = (await response.json()) as { success: boolean; data: { status: string; database?: string } };
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.data.status, 'ok');
    assert.strictEqual(json.data.database, 'connected');
  });

  it('proves Next.js route handler app/api/v1/health/route.ts executes correctly', async () => {
    const { GET } = await import('../../app/api/v1/health/route');
    const request = new Request('http://localhost:3000/api/v1/health', {
      method: 'GET',
    });

    const response = await GET(request);
    assert.strictEqual(response.status, 200);
    const json = (await response.json()) as { success: boolean; data: { status: string } };
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.data.status, 'ok');
  });
});
