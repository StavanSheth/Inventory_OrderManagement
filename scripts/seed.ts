import path from 'node:path';
import { createFileD1Database, createMemoryD1Database } from '../database/adapter.sqlite';
import { runMigrations } from '../database/migrations/runner';
import { runDevSeed } from '../database/seeds/dev-seed';

async function main() {
  const args = process.argv.slice(2);
  const useMemory = args.includes('--memory');

  const defaultDbPath = path.resolve(process.cwd(), '.data', 'local.sqlite');
  const dbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : defaultDbPath;

  console.log(`[seed] Target: ${useMemory ? 'in-memory SQLite' : `persistent file (${dbPath})`}`);

  const db = useMemory ? createMemoryD1Database() : createFileD1Database(dbPath);
  const migrationsDir = path.resolve(process.cwd(), 'database', 'migrations');

  // Ensure migrations are run before seeding
  await runMigrations(db, migrationsDir);

  const result = await runDevSeed(db);
  console.log('[seed] Development seed completed successfully:', result);
}

main().catch((err) => {
  console.error('[seed] Seeding failed:', err);
  process.exit(1);
});
