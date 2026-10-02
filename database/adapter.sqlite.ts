import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { D1DatabaseLike, D1PreparedStatementLike, D1ResultLike } from './types';

class SqlitePreparedStatement implements D1PreparedStatementLike {
  private boundValues: unknown[] = [];

  constructor(
    private db: DatabaseSync,
    private sql: string,
  ) {}

  bind(...values: unknown[]): D1PreparedStatementLike {
    const next = new SqlitePreparedStatement(this.db, this.sql);
    next.boundValues = values.length === 1 && Array.isArray(values[0]) ? values[0] : values;
    return next;
  }

  async first<T = unknown>(colName?: string): Promise<T | null> {
    const stmt = this.db.prepare(this.sql);
    const row = stmt.get(...(this.boundValues as any[])) as Record<string, unknown> | undefined;
    if (!row) return null;
    if (colName) return (row[colName] as T) ?? null;
    return row as T;
  }

  async all<T = unknown>(): Promise<D1ResultLike<T>> {
    const stmt = this.db.prepare(this.sql);
    const rows = stmt.all(...(this.boundValues as any[])) as T[];
    return {
      results: rows,
      success: true,
      meta: { changes: 0 },
    };
  }

  async run<T = unknown>(): Promise<D1ResultLike<T>> {
    const stmt = this.db.prepare(this.sql);
    const res = stmt.run(...(this.boundValues as any[]));
    return {
      results: [],
      success: true,
      meta: {
        changes: Number(res.changes),
        last_row_id: Number(res.lastInsertRowid),
      },
    };
  }
}

export class NodeSqliteD1Adapter implements D1DatabaseLike {
  constructor(private sqliteDb: DatabaseSync) {
    this.sqliteDb.exec('PRAGMA foreign_keys = ON;');
  }

  prepare(query: string): D1PreparedStatementLike {
    return new SqlitePreparedStatement(this.sqliteDb, query);
  }

  async exec(query: string): Promise<void> {
    this.sqliteDb.exec(query);
  }

  async batch<T = unknown>(statements: D1PreparedStatementLike[]): Promise<D1ResultLike<T>[]> {
    this.sqliteDb.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
      const results: D1ResultLike<T>[] = [];
      for (const stmt of statements) {
        results.push(await stmt.run<T>());
      }
      this.sqliteDb.exec('COMMIT;');
      return results;
    } catch (err) {
      this.sqliteDb.exec('ROLLBACK;');
      throw err;
    }
  }

  getNativeDb(): DatabaseSync {
    return this.sqliteDb;
  }
}

export function createMemoryD1Database(): D1DatabaseLike {
  const db = new DatabaseSync(':memory:');
  return new NodeSqliteD1Adapter(db);
}

export function createFileD1Database(filePath: string): D1DatabaseLike {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = new DatabaseSync(filePath);
  return new NodeSqliteD1Adapter(db);
}
