import fs from 'node:fs';
import path from 'node:path';
import { D1DatabaseLike } from '../types';

export interface MigrationRecord {
  id: number;
  name: string;
  applied_at: string;
}

export async function runMigrations(db: D1DatabaseLike, migrationsDir?: string): Promise<string[]> {
  const dir = migrationsDir ?? path.resolve(__dirname);

  // 1. Enable foreign keys
  await db.exec('PRAGMA foreign_keys = ON;');

  // 2. Ensure migrations tracking table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  // 3. Find migration files (*.sql)
  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const appliedNames: string[] = [];

  for (const file of files) {
    const existing = await db
      .prepare('SELECT id, name FROM _migrations WHERE name = ?')
      .bind(file)
      .first<{ id: number; name: string }>();

    if (!existing) {
      const filePath = path.join(dir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      // Execute the migration SQL
      await db.exec(sql);

      // Record applied migration
      await db
        .prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)')
        .bind(file, new Date().toISOString())
        .run();

      appliedNames.push(file);
    }
  }

  return appliedNames;
}
