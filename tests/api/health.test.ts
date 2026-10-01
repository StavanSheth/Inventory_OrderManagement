import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleHealthRoute } from '../../api/routes/health.route';
import { handleApiError } from '../../api/middleware/error-handler';
import { NotFoundError, ValidationError, AppError } from '../../backend/errors/app-error';
import { ApiErrorCode } from '../../shared/enums/errors.enum';
import { HTTP_STATUS } from '../../shared/constants/api.constants';

describe('API Foundation & Health Check', () => {
  it('GET /api/v1/health returns standard success envelope', async () => {
    const request = new Request('http://localhost:3000/api/v1/health', {
      method: 'GET',
      headers: {
        'x-request-id': 'test-req-123',
      },
    });

    const response = await handleHealthRoute(request);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get('content-type'), 'application/json');

    const json = (await response.json()) as { success: boolean; data: { status: string } };
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.data.status, 'ok');
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

  it('handles unexpected errors gracefully as internal error envelope', async () => {
    const error = new Error('Database connection timed out');
    const response = handleApiError(error);

    assert.strictEqual(response.status, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    const json = (await response.json()) as {
      success: boolean;
      error: { code: string; message: string };
    };

    assert.strictEqual(json.success, false);
    assert.strictEqual(json.error.code, ApiErrorCode.INTERNAL_ERROR);
    assert.strictEqual(json.error.message, 'Database connection timed out');
  });
});
