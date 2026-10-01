import { D1DatabaseLike } from './types';

/**
 * Creates a verified production database interface from Cloudflare D1 binding.
 * Completely free of Node.js-specific modules (fs, path, node:sqlite).
 */
export function createProductionDatabase(d1?: D1DatabaseLike): D1DatabaseLike {
  if (!d1 || typeof d1.prepare !== 'function') {
    throw new Error('D1 database binding "DB" is not available in runtime environment.');
  }
  return d1;
}
