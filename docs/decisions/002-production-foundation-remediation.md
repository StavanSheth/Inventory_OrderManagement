# ADR 002: Production Foundation Remediation & Cloudflare D1 Integration

## Context
Phase 1 foundation required remediation to achieve >= 90% production readiness across all foundation dimensions:
- Isolation of Cloudflare D1 production runtime from Node.js runtime code
- Persistent SQLite migrations and development seeding
- Strict configuration validation and environment boundary enforcement
- Clean frontend route composition via AppShell and removal of demo-only routes
- Centralized authoritative API response contracts
- Deterministic, zero-warning test and linting pipeline

## Decisions

1. **Cloudflare Runtime Boundary**:
   - `database/adapter.ts`: Pure D1 adapter accepting native `env.DB` without importing `node:sqlite`, `fs`, or `path`.
   - `database/adapter.sqlite.ts`: Node.js SQLite adapter strictly isolated to local testing and CLI scripts (`scripts/migrate.ts`, `scripts/seed.ts`, `tests/`).
   - `database/runtime.ts`: Unified runtime resolver decoupling services from specific database engines.
   - `wrangler.jsonc`: Added multi-environment D1 configuration (`DB` binding, `database/migrations` mapping) with explicit deployment placeholder strategy (`REPLACE_WITH_PRODUCTION_D1_DATABASE_ID`).

2. **Persistent Migrations & Schema Integrity**:
   - Local migrations target persistent file storage at `.data/local.sqlite` (or `DB_PATH`) instead of volatile in-memory databases.
   - Strict SQL CHECK constraints enforced across product pricing, inventory quantities, raw materials, order totals, and coupon values.
   - Migration runner tracks version execution in `_migrations` table with idempotent re-execution safety.

3. **Authoritative API Contracts**:
   - Created `shared/contracts/api-response.ts` establishing authoritative `ApiSuccessResponse<T>` and `ApiErrorResponse` envelope structures.
   - Re-exported and linked from `shared/contracts/` and `shared/types/common.types.ts` to prevent duplicate contracts.

4. **Frontend Architecture & Shell Composition**:
   - Encapsulated presentation engine effects (Loader, SmoothScroll, Animations, Cursor, RecordMode) inside `frontend/components/ui/AppShell.tsx`.
   - Stripped demo-only `app/patterns` route. `app/` strictly hosts route handlers, root layout, and page composition.
   - Replaced package name `showreel-kit` with `inventory-ordermanagement`.

5. **Deterministic Quality Pipeline**:
   - Configured ESLint 9 flat configuration (`eslint.config.mjs`) resolving Next.js 16 deprecations with zero warnings.
   - Built deterministic test runner (`scripts/run-tests.ts`) executing 35 tests across 10 test suites via native Node test runner.
