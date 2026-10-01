import { D1DatabaseLike, CloudflareEnv } from './types';
import { createProductionDatabase } from './adapter';

let fallbackProvider: (() => D1DatabaseLike) | null = null;

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
}

/**
 * Resolves the active D1Database instance.
 * In Cloudflare production, extracts env.DB from the request/execution context.
 * In testing/local development, uses the registered provider or throws.
 */
export function getDatabase(context?: { env?: CloudflareEnv }): D1DatabaseLike {
  if (context?.env?.DB) {
    return createProductionDatabase(context.env.DB);
  }

  // Global / process binding if injected by Cloudflare Workers runtime
  const globalEnv = (globalThis as unknown as { env?: CloudflareEnv }).env;
  if (globalEnv?.DB) {
    return createProductionDatabase(globalEnv.DB);
  }

  if (fallbackProvider) {
    return fallbackProvider();
  }

  throw new Error(
    'No D1 database binding found. In Cloudflare Workers, pass { env: { DB: ... } }. In local/test mode, register a provider via setFallbackDatabaseProvider().',
  );
}
