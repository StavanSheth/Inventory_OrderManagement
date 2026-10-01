import path from 'node:path';
import { createFileD1Database, createMemoryD1Database } from '../database/adapter.sqlite';
import { runMigrations, getAppliedMigrations } from '../database/migrations/runner';

async function main() {
  const args = process.argv.slice(2);
  const useMemory = args.includes('--memory');
  const checkOnly = args.includes('--check');

  const defaultDbPath = path.resolve(process.cwd(), '.data', 'local.sqlite');
  const dbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : defaultDbPath;

  console.log(`[migrate] Mode: ${useMemory ? 'in-memory SQLite' : `persistent file (${dbPath})`}`);

  const db = useMemory ? createMemoryD1Database() : createFileD1Database(dbPath);
  const migrationsDir = path.resolve(process.cwd(), 'database', 'migrations');

  if (checkOnly) {
    const applied = await getAppliedMigrations(db);
    console.log(`[migrate] Already applied migrations (${applied.length}):`, applied.map((m) => m.name));
    return;
  }

  const applied = await runMigrations(db, migrationsDir);
  if (applied.length === 0) {
    console.log('[migrate] Database is already up to date. No new migrations applied.');
  } else {
    console.log(`[migrate] Successfully applied ${applied.length} migration(s):`, applied);
  }
}

main().catch((err) => {
  console.error('[migrate] Migration execution failed:', err);
  process.exit(1);
});
