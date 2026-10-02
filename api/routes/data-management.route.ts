import { z } from 'zod';
import { createAuthInfrastructure, AuthFactoryOptions } from '../factories/auth.factory';
import { DeletionService } from '../../backend/services/deletion';
import { successResponse } from '../serializers/response';
import { handleApiError } from '../middleware/error-handler';
import { validateRequest } from '../validators/request.validator';
import { requireOwner } from '../../backend/policies/role.policy';
import { handleCorsPreflight, getCorsHeaders } from '../middleware/cors';
import { config } from '../../config/runtime';
import { D1DatabaseLike } from '../../database/types';

const previewDeletionSchema = z.object({
  branchId: z.string().min(1, 'Branch ID is required'),
});

const deactivateBranchSchema = z.object({
  branchId: z.string().min(1, 'Branch ID is required'),
});

const anonymizeCustomerSchema = z.object({
  customerUserId: z.string().min(1, 'Customer User ID is required'),
  reason: z.string().max(255).optional(),
});

export async function handlePreviewBranchDeletionRoute(
  request: Request,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(request, config.allowedOrigins);

  try {
    const { db, authMiddleware } = createAuthInfrastructure(env, options);
    const userContext = await authMiddleware.authenticateRequest(request, { requireSession: false });

    // Owner only
    requireOwner(userContext);

    const rawBody = await request.json();
    const body = validateRequest(previewDeletionSchema, rawBody);
    const deletionService = new DeletionService(db);
    const preview = await deletionService.previewBranchDeletion(body.branchId);

    return successResponse(preview, 200, corsHeaders);
  } catch (error) {
    return handleApiError(error, corsHeaders);
  }
}

export async function handleDeactivateBranchRoute(
  request: Request,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(request, config.allowedOrigins);

  try {
    const { db, authMiddleware } = createAuthInfrastructure(env, options);
    const userContext = await authMiddleware.authenticateRequest(request, { requireSession: false });

    // Owner only
    requireOwner(userContext);

    const rawBody = await request.json();
    const body = validateRequest(deactivateBranchSchema, rawBody);
    const deletionService = new DeletionService(db);
    const result = await deletionService.deactivateBranch(userContext.userId, body.branchId);

    return successResponse(result, 200, corsHeaders);
  } catch (error) {
    return handleApiError(error, corsHeaders);
  }
}

export async function handleAnonymizeCustomerRoute(
  request: Request,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(request, config.allowedOrigins);

  try {
    const { db, authMiddleware } = createAuthInfrastructure(env, options);
    const userContext = await authMiddleware.authenticateRequest(request, { requireSession: false });

    // Owner only
    requireOwner(userContext);

    const rawBody = await request.json();
    const body = validateRequest(anonymizeCustomerSchema, rawBody);
    const deletionService = new DeletionService(db);
    const result = await deletionService.anonymizeCustomer(userContext.userId, body.customerUserId, body.reason);

    return successResponse(result, 200, corsHeaders);
  } catch (error) {
    return handleApiError(error, corsHeaders);
  }
}

export const ALLOWED_DATA_TABLES = [
  'users',
  'orders',
  'order_items',
  'payments',
  'inventory',
  'raw_materials',
  'inventory_movements',
  'products',
  'branches',
  'coupons',
  'audit_logs',
] as const;

export async function handleGetTablesDataRoute(
  request: Request,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(request, config.allowedOrigins);

  try {
    const { db, authMiddleware } = createAuthInfrastructure(env, options);
    const userContext = await authMiddleware.authenticateRequest(request, { requireSession: false });
    requireOwner(userContext);

    const url = new URL(request.url);
    const targetTable = url.searchParams.get('table');

    // Get counts for all tables
    const tableCounts: Record<string, number> = {};
    for (const t of ALLOWED_DATA_TABLES) {
      try {
        const countRes = await db.prepare(`SELECT COUNT(*) as count FROM ${t}`).first<{ count: number }>();
        tableCounts[t] = countRes?.count ?? 0;
      } catch {
        tableCounts[t] = 0;
      }
    }

    let rows: Record<string, unknown>[] = [];
    let selectedTable = targetTable;
    if (targetTable && ALLOWED_DATA_TABLES.includes(targetTable as (typeof ALLOWED_DATA_TABLES)[number])) {
      try {
        const queryRes = await db.prepare(`SELECT * FROM ${targetTable} ORDER BY rowid DESC LIMIT 100`).all();
        rows = (queryRes.results as Record<string, unknown>[]) || [];
      } catch {
        rows = [];
      }
    } else {
      selectedTable = ALLOWED_DATA_TABLES[0];
      const queryRes = await db.prepare(`SELECT * FROM ${selectedTable} ORDER BY rowid DESC LIMIT 100`).all();
      rows = (queryRes.results as Record<string, unknown>[]) || [];
    }

    // Storage statistics: default 5 GB upper max
    const DEFAULT_MAX_STORAGE_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB = 5,368,709,120 bytes
    let usedBytes = 0;
    try {
      const pageCountRes = await db.prepare('PRAGMA page_count;').first<{ page_count?: number }>();
      const pageSizeRes = await db.prepare('PRAGMA page_size;').first<{ page_size?: number }>();
      const pageCount = Number(pageCountRes?.page_count ?? (pageCountRes as any)?.[0] ?? 0);
      const pageSize = Number(pageSizeRes?.page_size ?? (pageSizeRes as any)?.[0] ?? 4096);
      usedBytes = pageCount * pageSize;
    } catch {
      usedBytes = 0;
    }

    // Total rows across all tables
    const totalRecords = Object.values(tableCounts).reduce((acc, count) => acc + count, 0);

    if (!usedBytes || usedBytes <= 0) {
      // Robust fallback: 2 KB per record + 1 MB base SQLite overhead
      usedBytes = (totalRecords * 2048) + (1024 * 1024);
    }

    const remainingBytes = Math.max(0, DEFAULT_MAX_STORAGE_BYTES - usedBytes);
    const usedPercentage = Number(((usedBytes / DEFAULT_MAX_STORAGE_BYTES) * 100).toFixed(4));

    // Optional complete dump of all tables (e.g. for automatic Excel backup)
    let allTablesData: Record<string, Record<string, unknown>[]> | undefined = undefined;
    if (url.searchParams.get('all') === 'true' || targetTable === 'all') {
      allTablesData = {};
      for (const t of ALLOWED_DATA_TABLES) {
        try {
          const allRes = await db.prepare(`SELECT * FROM ${t} ORDER BY rowid DESC`).all();
          allTablesData[t] = (allRes.results as Record<string, unknown>[]) || [];
        } catch {
          allTablesData[t] = [];
        }
      }
    }

    return successResponse(
      {
        tables: tableCounts,
        currentTable: selectedTable,
        rows,
        allTables: allTablesData,
        storage: {
          maxBytes: DEFAULT_MAX_STORAGE_BYTES,
          usedBytes,
          remainingBytes,
          usedPercentage,
          totalRecords,
        },
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    return handleApiError(error, corsHeaders);
  }
}

export async function handleDeleteTablesDataRoute(
  request: Request,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(request, config.allowedOrigins);

  try {
    const { db, authMiddleware } = createAuthInfrastructure(env, options);
    const userContext = await authMiddleware.authenticateRequest(request, { requireSession: false });
    requireOwner(userContext);

    const body = (await request.json()) as {
      action: 'delete_row' | 'clear_table' | 'clear_all';
      table?: string;
      id?: string;
    };

    if (body.action === 'delete_row') {
      if (!body.table || !body.id) {
        throw new Error('Table name and row ID are required for row deletion');
      }
      if (!ALLOWED_DATA_TABLES.includes(body.table as (typeof ALLOWED_DATA_TABLES)[number])) {
        throw new Error(`Table ${body.table} not permitted`);
      }

      await db.prepare(`DELETE FROM ${body.table} WHERE id = ?`).bind(body.id).run();
      return successResponse({ success: true, message: `Row ${body.id} deleted from ${body.table}` }, 200, corsHeaders);
    }

    if (body.action === 'clear_table') {
      if (!body.table || !ALLOWED_DATA_TABLES.includes(body.table as (typeof ALLOWED_DATA_TABLES)[number])) {
        throw new Error(`Table ${body.table} not permitted`);
      }

      await db.prepare(`DELETE FROM ${body.table}`).run();
      return successResponse({ success: true, message: `Table ${body.table} cleared successfully` }, 200, corsHeaders);
    }

    if (body.action === 'clear_all') {
      const operationalTables = ['order_items', 'payments', 'orders', 'inventory_movements', 'audit_logs'];
      for (const t of operationalTables) {
        await db.prepare(`DELETE FROM ${t}`).run();
      }
      return successResponse({ success: true, message: 'All operational tables cleared successfully' }, 200, corsHeaders);
    }

    throw new Error('Invalid deletion action');
  } catch (error) {
    return handleApiError(error, corsHeaders);
  }
}
