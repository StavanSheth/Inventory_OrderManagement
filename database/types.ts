/**
 * Interface representing Cloudflare D1 Database and statements.
 * Compatible with @cloudflare/workers-types D1Database.
 */

export interface D1ResultLike<T = unknown> {
  results: T[];
  success: boolean;
  error?: string;
  meta?: {
    changes?: number;
    last_row_id?: number;
    duration?: number;
    [key: string]: unknown;
  };
}

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = unknown>(colName?: string): Promise<T | null>;
  all<T = unknown>(): Promise<D1ResultLike<T>>;
  run<T = unknown>(): Promise<D1ResultLike<T>>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
  dump?(): Promise<ArrayBuffer>;
  batch<T = unknown>(statements: D1PreparedStatementLike[]): Promise<D1ResultLike<T>[]>;
  exec(query: string): Promise<void> | void;
}

export interface CloudflareEnv {
  DB?: D1DatabaseLike;
  [key: string]: unknown;
}
