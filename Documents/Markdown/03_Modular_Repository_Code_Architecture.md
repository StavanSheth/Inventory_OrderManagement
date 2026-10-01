# 03 — Modular Repository & Code Architecture

## 1. Repository Goal
The repository must be modular enough that:
- frontend, backend, API, and database can evolve independently
- features can be added without creating monolithic files
- reusable modules are shared instead of duplicated
- business rules remain testable
- an AI coding agent can locate the correct module quickly

## 2. Recommended Repository
```text
project/
├── frontend/
│   ├── app/
│   ├── pages/
│   ├── layouts/
│   ├── components/
│   │   ├── ui/
│   │   ├── forms/
│   │   ├── tables/
│   │   ├── charts/
│   │   └── feedback/
│   ├── modules/
│   │   ├── auth/
│   │   ├── customer/
│   │   ├── orders/
│   │   ├── inventory/
│   │   ├── promotions/
│   │   ├── dashboard/
│   │   ├── branches/
│   │   ├── settings/
│   │   └── messaging/
│   ├── hooks/
│   ├── services/
│   ├── stores/
│   ├── routes/
│   ├── types/
│   ├── utils/
│   └── styles/
│
├── backend/
│   ├── services/
│   │   ├── auth/
│   │   ├── orders/
│   │   ├── inventory/
│   │   ├── promotions/
│   │   ├── dashboard/
│   │   ├── branches/
│   │   ├── deletion/
│   │   └── messaging/
│   ├── middleware/
│   ├── policies/
│   ├── jobs/
│   ├── domain/
│   ├── errors/
│   └── utils/
│
├── api/
│   ├── routes/
│   ├── controllers/
│   ├── validators/
│   ├── serializers/
│   └── middleware/
│
├── database/
│   ├── migrations/
│   ├── schema/
│   ├── repositories/
│   ├── queries/
│   ├── seeds/
│   └── fixtures/
│
├── shared/
│   ├── types/
│   ├── constants/
│   ├── schemas/
│   ├── enums/
│   ├── business-rules/
│   └── contracts/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── api/
│   └── e2e/
│
├── docs/
├── scripts/
├── config/
└── README.md
```

## 3. Module Boundaries

### Orders module
Owns:
- cart/order transformation
- order state transitions
- order editing
- order expiry
- order history
- order totals orchestration

Must not own:
- raw inventory SQL
- Firebase token verification
- UI rendering

### Inventory module
Owns:
- stock
- raw materials
- product inventory
- movements
- refill
- adjustment
- consumption

### Promotions module
Owns:
- offers
- coupons
- eligibility
- usage limits
- redemption

### Dashboard module
Owns:
- aggregate metrics
- trend queries
- summary calculations

### Branch module
Owns:
- branches
- memberships
- branch configuration
- branch context

### Messaging module
Owns:
- message audience selection
- templates
- dummy send
- provider abstraction

## 4. Frontend Rules
Components should be small and reusable.

Preferred:
```text
OrderPage
  -> ProductGrid
  -> Cart
  -> CouponInput
  -> OrderSummary
  -> SubmitOrderButton
```

Avoid:
```text
OrderPage.tsx
  -> 2,000 lines of UI + API + business logic
```

Frontend should call typed service functions rather than constructing raw API requests throughout components.

## 5. API Rules
Routes define HTTP endpoints.

Controllers:
- parse request
- invoke service
- serialize response

Controllers must not contain long business algorithms.

Example:
```text
POST /api/orders
 -> createOrderController
 -> orderService.createOrder()
 -> orderRepository
```

## 6. Business Service Rules
Services:
- enforce business rules
- orchestrate repositories
- execute transactions
- emit domain events

Services must be independent of UI.

## 7. Repository Rules
Repositories:
- contain SQL
- accept typed parameters
- return typed domain/data models
- use parameterized queries
- do not make authorization decisions
- do not calculate UI formatting

## 8. Shared Code
Shared:
- enums
- API contracts
- validation schemas
- error codes
- types
- constants

Do not share:
- server secrets
- database connections
- server-only authorization code

## 9. Naming
Use consistent conventions.

Examples:
```text
order.service.ts
order.repository.ts
order.routes.ts
order.controller.ts
order.schema.ts
OrderCard.tsx
OrderHistoryPage.tsx
```

Avoid ambiguous names:
```text
utils2.ts
helper.ts
misc.ts
common.ts
final.ts
newService.ts
```

## 10. Dependency Direction
Preferred:
```text
UI
 ↓
Frontend service
 ↓
API
 ↓
Controller
 ↓
Business service
 ↓
Repository
 ↓
Database
```

Forbidden:
- database importing frontend
- repository importing React
- business service importing UI
- frontend directly executing SQL

## 11. Reusable Module Rules
Create a reusable module when:
- it has a clear responsibility
- it is used by multiple features
- it contains stable business behavior
- it has its own tests

Avoid premature abstraction for one-off UI.

## 12. Business Rule Centralization
Pricing, coupon eligibility, order state transitions, inventory consumption, and branch authorization must have one authoritative implementation.

Do not duplicate:
```text
calculateOrderTotal()
```
in three different components.

## 13. State Management
Use local component state for local UI state.

Use centralized state only for:
- authenticated identity
- active branch context
- cart where cross-page persistence is required
- realtime order state
- global UI state

Do not put every API response into a global store.

## 14. API Contract
Frontend and backend communicate through typed contracts.

Each contract defines:
- request
- response
- error codes
- pagination
- filters
- sorting

## 15. Testing
Every core service must have unit tests.

Critical integration tests:
- customer can place order
- expired order cannot confirm
- confirmed order deducts inventory
- coupon cannot exceed usage limit
- branch cannot access another branch
- owner can access all branches
- order edit recalculates inventory/payment
- deletion respects selected scope

## 16. AI Coding Agent Rules
An AI agent must:
1. Search for an existing module before creating a new one.
2. Reuse existing services/components.
3. Never duplicate business logic.
4. Follow existing API contracts.
5. Add migration when changing schema.
6. Add tests for changed business rules.
7. Never bypass RBAC.
8. Never modify unrelated modules.
9. Keep changes modular.
10. Update documentation when architecture changes.

## 17. Dead Code Rules
Do not retain:
- unused components
- unused API routes
- abandoned services
- duplicate helpers
- stale feature flags
- obsolete database fields

Dead code removal must be verified through imports/routes/references before deletion.

## 18. Feature Module Template
A feature may follow:
```text
feature/
├── components/
├── hooks/
├── service.ts
├── types.ts
├── schema.ts
└── tests/
```

Backend:
```text
feature/
├── feature.service.ts
├── feature.repository.ts
├── feature.schema.ts
├── feature.types.ts
└── feature.test.ts
```

## 19. Definition of Done
A feature is complete only when:
- UI implemented
- API implemented
- validation implemented
- authorization implemented
- database migration implemented if needed
- tests implemented
- loading/error/empty states handled
- branch scope verified
- audit requirements handled
- documentation updated
