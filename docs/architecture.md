# System Architecture & Repository Boundaries

## 1. Modular Architecture Overview

The repository is structured to support multi-branch operations, strict data isolation, and clear separation of concerns across presentation, routing, business logic, and database access.

```
/
├── app/                  # Next.js App Router entry points & route handlers
├── frontend/             # Reusable UI components, feature modules, client services
├── backend/              # Server business services, domain models, policies, errors
├── api/                  # API routing, controllers, validators, serializers, middleware
├── database/             # Cloudflare D1/SQLite schema, migrations, repositories, seeds
├── shared/               # Shared types, constants, contracts, enums, business rules
├── tests/                # Unit, integration, api, and e2e tests
├── config/               # Environment & runtime configuration with validation
├── scripts/              # Migration, seed, and development automation scripts
├── docs/                 # Architecture, database, and operational documentation
└── public/               # Static assets (images, frames, fonts)
```

## 2. Architectural Dependency Direction

```
Frontend UI (app/ & frontend/components)
       ↓
Frontend Services (frontend/services)
       ↓
API Route Handlers (app/api/v1/...)
       ↓
API Controllers & Validators (api/controllers & api/validators)
       ↓
Backend Services (backend/services)
       ↓
Repositories (database/repositories)
       ↓
Database (Cloudflare D1 / SQLite)
```

### Dependency Rules:
1. **Frontend UI** never accesses the database directly or executes SQL.
2. **API Routes** remain thin adapters delegating to API controllers and validators.
3. **Controllers** orchestrate request parsing, validation, and error serialization.
4. **Backend Services** hold authoritative business logic (pricing, inventory, validation).
5. **Repositories** are responsible solely for parameterized SQL execution.
6. **Shared Layer** (`shared/`) provides common enums, constants, types, and schemas used across both client and server without side effects.

## 3. Module Boundaries (`frontend/modules`)

Each operational domain is encapsulated in its own module:
- `auth`: Google Sign-In & Firebase token identity mapping
- `customer`: Branch discovery, customer cart & ordering flow
- `orders`: Order placement, tracking, lifecycle state management
- `inventory`: Branch finished goods & raw materials management
- `promotions`: Coupons, offers, and discounts
- `dashboard`: Realtime branch metrics and statistics
- `branches`: Multi-branch administration and branch-scoped settings
- `settings`: Session timeout, order expiry & editing configurations
- `messaging`: Branch messaging campaigns (dummy WhatsApp workflow)
