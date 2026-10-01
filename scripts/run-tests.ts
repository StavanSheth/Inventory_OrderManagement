import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import path from 'node:path';

const testFiles = [
  'tests/unit/config.test.ts',
  'tests/unit/cors.test.ts',
  'tests/integration/schema-migrations.test.ts',
  'tests/integration/seed-data.test.ts',
  'tests/integration/repositories.test.ts',
  'tests/integration/backend-services.test.ts',
  'tests/integration/d1-abstraction.test.ts',
  'tests/integration/persistent-db.test.ts',
  'tests/api/health.test.ts',
  'tests/e2e/e2e-stub.test.ts',
].map((rel) => path.resolve(process.cwd(), rel));

console.log(`[test-runner] Executing ${testFiles.length} test suites deterministically across platforms...`);

run({ files: testFiles })
  .compose(spec)
  .pipe(process.stdout);
