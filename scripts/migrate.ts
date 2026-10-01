import path from 'node:path';
import { createMemoryD1Database } from '../database/adapter';
import { runMigrations } from '../database/migrations/runner';

async function main() {
  console.log('Running migrations...');
  const db = createMemoryD1Database();
  const migrationsDir = path.resolve(process.cwd(), 'database', 'migrations');
  const applied = await runMigrations(db, migrationsDir);
  console.log(`Applied ${applied.length} migration(s):`, applied);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
