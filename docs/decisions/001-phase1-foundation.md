# ADR 001: Phase 1 Foundation Architecture & Database Strategy

## Context
The application is transitioning from a standalone showreel landing page into a full multi-branch Ice Cream Ordering and Inventory Management platform targeting Cloudflare D1/SQLite.

## Decisions

1. **Modular Layering**:
   - `app/`: Next.js App Router entry points and route adapters only.
   - `frontend/`: UI components, module boundaries, stores, hooks, and services.
   - `backend/`: Authoritative business logic, errors, domain models, policies, and jobs.
   - `api/`: Controllers, validators, serializers, middleware, and route handlers.
   - `database/`: Schema, migrations, repositories, seeds, and adapters.
   - `shared/`: Isomorphic types, enums, constants, and contracts.

2. **D1 & SQLite Adapter Strategy**:
   - Used direct parameterized SQL with repository abstractions rather than heavy ORMs.
   - Created a lightweight adapter bridging Node.js 22's native `node:sqlite` to the Cloudflare `D1DatabaseLike` interface.
   - Avoided native C++ compilation dependencies (such as better-sqlite3) on Windows while remaining 100% compliant with Cloudflare D1.

3. **Asset & UI Preservation**:
   - Preserved all existing visual infrastructure in `components/engine/`, `components/patterns/`, `components/ui/`, and `site/` without regression.
   - Re-exported foundational UI components in `frontend/components/ui/` to prevent duplicate implementations.

4. **Zero Phase 2+ Scope Creep**:
   - Established structural interfaces and contracts for auth, ordering, inventory, dashboard, coupons, and messaging without implementing premature business logic.
