import { D1DatabaseLike, CloudflareEnv } from './types';
import { createProductionDatabase } from './adapter';

let fallbackProvider: (() => D1DatabaseLike) | null = null;
let cachedLocalDb: D1DatabaseLike | null = null;

/**
 * Registers a fallback database provider for local testing or dev emulation.
 */
export function setFallbackDatabaseProvider(provider: () => D1DatabaseLike): void {
  fallbackProvider = provider;
}

/**
 * Resets the fallback database provider.
 */
export function resetDatabaseProvider(): void {
  fallbackProvider = null;
  cachedLocalDb = null;
}

/**
 * Resolves the active D1Database instance.
 * In Cloudflare production, extracts env.DB from the request/execution context.
 * In testing/local development, uses the registered provider, local SQLite file, or throws.
 */
export function getDatabase(context?: { env?: CloudflareEnv } | CloudflareEnv): D1DatabaseLike {
  const directDb = (context as CloudflareEnv)?.DB;
  const nestedDb = (context as { env?: CloudflareEnv })?.env?.DB;
  const rawDb = directDb ?? nestedDb;

  if (rawDb) {
    return createProductionDatabase(rawDb);
  }

  // Global / process binding if injected by Cloudflare Workers runtime
  const globalEnv = (globalThis as unknown as { env?: CloudflareEnv }).env;
  if (globalEnv?.DB) {
    return createProductionDatabase(globalEnv.DB);
  }

  if (fallbackProvider) {
    return fallbackProvider();
  }

  // In local Node environment (e.g. Next.js development server), fallback to local persistent SQLite file
  if (process.env.NODE_ENV !== 'test' && typeof process !== 'undefined' && process.versions?.node) {
    try {
      if (cachedLocalDb) {
        return cachedLocalDb;
      }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('node:fs');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require('node:path');
      const defaultDbPath = path.resolve(process.cwd(), '.data', 'local.sqlite');
      const dbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : defaultDbPath;

      if (fs.existsSync(dbPath)) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { createFileD1Database } = require('./adapter.sqlite');
        const localDb: D1DatabaseLike = createFileD1Database(dbPath);
        cachedLocalDb = localDb;
        return localDb;
      }
    } catch {
      // Ignore if node:sqlite or path resolution is not available
    }
  }

  throw new Error(
    'No D1 database binding found. In Cloudflare Workers, pass { env: { DB: ... } }. In local/test mode, register a provider via setFallbackDatabaseProvider().',
  );
}
