(process.env as Record<string, string | undefined>).NODE_ENV = 'test';

import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import path from 'node:path';

const testFiles = [
  'tests/unit/config.test.ts',
  'tests/unit/cors.test.ts',
  'tests/unit/auth-pin.test.ts',
  'tests/unit/firebase-production-verifier.test.ts',
  'tests/unit/environment-auth.test.ts',
  'tests/unit/policies.test.ts',
  'tests/unit/order-rules.test.ts',
  'tests/unit/order-calculation.test.ts',
  'tests/unit/payment-difference.test.ts',
  'tests/unit/promotions.test.ts',
  'tests/unit/inventory-bom.test.ts',
  'tests/unit/responsive-ui-components.test.ts',
  'tests/unit/subdomain-security.test.ts',
  'tests/integration/schema-migrations.test.ts',
  'tests/integration/seed-data.test.ts',
  'tests/integration/comprehensive-seed.test.ts',
  'tests/integration/repositories.test.ts',
  'tests/integration/backend-services.test.ts',
  'tests/integration/d1-abstraction.test.ts',
  'tests/integration/persistent-db.test.ts',
  'tests/integration/auth-rbac.test.ts',
  'tests/integration/order-lifecycle.test.ts',
  'tests/integration/phase4-inventory-promotions.test.ts',
  'tests/integration/phase4-concurrency-remediation.test.ts',
  'tests/integration/atomicity.test.ts',
  'tests/integration/concurrency.test.ts',
  'tests/integration/phase5-owner-platform.test.ts',
  'tests/integration/phase6-production-hardening.test.ts',
  'tests/api/health.test.ts',
  'tests/api/auth-endpoints.test.ts',
  'tests/api/order-api.test.ts',
  'tests/api/nextjs-routes.test.ts',
  'tests/api/realtime-api.test.ts',
  'tests/api/inventory-promotions-api.test.ts',
  'tests/e2e/e2e-stub.test.ts',
].map((rel) => path.resolve(process.cwd(), rel));

console.log(`[test-runner] Executing ${testFiles.length} test suites deterministically across platforms...`);

run({ files: testFiles })
  .compose(spec)
  .pipe(process.stdout);
