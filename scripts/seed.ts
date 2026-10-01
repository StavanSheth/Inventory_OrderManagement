import path from 'node:path';
import { createMemoryD1Database } from '../database/adapter';
import { runMigrations } from '../database/migrations/runner';
import { runDevSeed } from '../database/seeds/dev-seed';

async function main() {
  console.log('Seeding development database...');
  const db = createMemoryD1Database();
  const migrationsDir = path.resolve(process.cwd(), 'database', 'migrations');
  await runMigrations(db, migrationsDir);
  const result = await runDevSeed(db);
  console.log('Seed completed successfully:', result);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
