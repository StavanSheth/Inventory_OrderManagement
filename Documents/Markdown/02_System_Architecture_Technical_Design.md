# 02 — System Architecture & Technical Design

## 1. Target Stack
### Frontend
- React
- TypeScript
- Vite or the project's selected React-compatible build system
- Tailwind CSS
- React Router
- Firebase client SDK for authentication
- Realtime client/service layer

### Backend
- Cloudflare Pages Functions / Cloudflare Workers
- TypeScript
- Modular service layer
- Validation layer
- Authorization middleware
- D1 database binding

### Authentication
- Firebase Authentication
- Google provider
- Firebase ID token verification on backend
- No application password storage

### Database
- Cloudflare D1 / SQLite
- Migration-based schema
- Repository/data-access layer
- Branch-scoped queries

### Hosting
- Cloudflare Pages for frontend
- Cloudflare Workers/Pages Functions for APIs

## 2. High-Level Architecture
```text
Browser
  |
  v
Cloudflare Pages
  |
  +--> React Frontend
  |
  +--> Pages Functions / Workers
          |
          +--> Auth Verification
          +--> RBAC
          +--> Business Services
          +--> D1 Repository Layer
          +--> Realtime Event Layer
          +--> Scheduled Jobs
```

Firebase:
```text
Browser
  |
  +--> Firebase Google Sign-In
  |
  +--> Firebase ID Token
            |
            v
        Worker API
            |
       Verify token
            |
       Map identity
            |
       Branch/role authorization
```

## 3. Architecture Boundaries
### Frontend
Responsible for:
- presentation
- navigation
- local UI state
- form handling
- calling APIs
- rendering realtime state

Not responsible for:
- authoritative pricing
- coupon validation
- inventory deduction
- branch authorization
- payment confirmation authority
- deletion authorization

### API
Responsible for:
- authentication verification
- authorization
- request validation
- orchestration
- transaction boundaries
- response formatting

### Business services
Responsible for:
- order lifecycle
- pricing
- promotions
- inventory
- payment state
- branch rules
- deletion policies

### Database repository
Responsible for:
- SQL
- parameterized queries
- transactions
- mapping database records to domain models

## 4. Request Flow
```text
UI action
 -> API client
 -> Worker route
 -> Firebase token verification
 -> identity lookup
 -> role/branch authorization
 -> request validation
 -> business service
 -> repository
 -> D1 transaction
 -> domain result
 -> API response
 -> UI update
```

## 5. Branch Isolation
Every branch-scoped query must include a branch scope.

Never rely on:
```text
SELECT * FROM orders WHERE id = ?
```

Use:
```text
SELECT * FROM orders
WHERE id = ?
AND branch_id = ?
```

Global Owner routes may intentionally omit branch filtering only when their authorization policy permits all-branch access.

Branch context must be derived from the authenticated server-side identity/session, not trusted from a client-provided branch ID alone.

## 6. Order Architecture
Order creation:
1. Validate customer identity.
2. Resolve active branch.
3. Resolve products and prices from database.
4. Validate stock/availability.
5. Resolve offers/coupon.
6. Calculate server-side totals.
7. Create order and items.
8. Set expiry timestamp to now + 15 minutes.
9. Publish order-created event.
10. Return order status.

Confirmation:
1. Verify operator authorization.
2. Lock/revalidate order.
3. Verify not expired.
4. Verify payment.
5. Recalculate authoritative totals.
6. Apply inventory deduction transactionally.
7. Mark order confirmed.
8. Record payment confirmation.
9. Publish realtime order-status event.

## 7. Order Expiration
Use a scheduled Worker/cron or equivalent server-side mechanism.

The expiration process:
- locate eligible `PENDING_PAYMENT` orders
- compare server time with `expires_at`
- mark expired
- never deduct inventory
- emit status event

The client timer is only visual. Server time is authoritative.

## 8. Order Editing
Order edit service must:
- verify edit window
- verify operator access
- retrieve current order
- validate new items/quantities
- recalculate promotions
- calculate inventory delta
- calculate payment difference
- commit all related changes atomically
- create audit record
- publish order-updated event

## 9. Inventory Architecture
Inventory is event-driven at the business layer.

Example:
```text
ORDER CONFIRMED
      |
      v
Inventory Service
      |
      +--> Product stock decrement
      +--> Raw-material consumption
      +--> Inventory movement
```

Refill:
```text
REFILL
  -> inventory movement
  -> stock increase
```

Adjustment:
```text
ADJUSTMENT
  -> reason required
  -> movement
  -> stock change
```

## 10. Realtime
Realtime status is required for:
- new order visibility at branch
- order confirmation visible to customer
- order edits
- expiration

Preferred implementation should abstract realtime behind:
```text
RealtimePublisher
RealtimeSubscriber
```

The initial implementation may use a lightweight polling/SSE/WebSocket-compatible approach supported by the selected Cloudflare architecture. The business modules must not depend directly on a vendor-specific realtime API.

## 11. Authentication
Firebase is the identity provider.

Frontend:
```text
Google Sign-In
 -> Firebase ID token
 -> API Authorization header
```

Backend:
```text
Authorization: Bearer <Firebase ID Token>
```

Backend verifies:
- signature
- issuer
- audience
- expiry
- subject

Then maps Firebase UID to application user/branch membership.

## 12. Session/PIN
Authentication identity and application session are separate concepts.

- Firebase establishes identity.
- Application session establishes branch/operator context.
- Branch PIN unlocks/authorizes operational access according to configured timeout.
- Timeout is configurable in minutes/hours/days.
- Expired application session requires reauthentication/unlock.
- Sensitive operations can require fresh PIN.

## 13. Dashboard Architecture
Dashboard should use server-side aggregate queries.

Avoid downloading all orders and calculating everything in the browser.

Use endpoints such as:
```text
GET /api/dashboard/summary
GET /api/dashboard/trends
GET /api/dashboard/top-products
GET /api/dashboard/inventory
```

Date ranges are explicit.

## 14. Deletion Architecture
Deletion is an administrative workflow.

Flow:
```text
Owner
 -> choose date range
 -> choose modules/tables
 -> preview counts
 -> confirm
 -> authorization check
 -> dependency-safe transaction/batches
 -> audit
```

Never expose raw SQL deletion to the frontend.

## 15. Scheduled Work
Scheduled jobs may handle:
- order expiry
- cleanup of transient records
- derived analytics maintenance if required

Business operations should not depend on scheduled jobs for immediate correctness.

## 16. Environment Configuration
Separate:
- development
- staging
- production

Secrets/config:
- Firebase project identifiers/config
- Firebase service verification configuration
- Cloudflare bindings
- application configuration
- allowed origins
- feature flags

Never commit secrets.

## 17. Error Architecture
Standard API error envelope:
```json
{
  "success": false,
  "error": {
    "code": "ORDER_EXPIRED",
    "message": "The order can no longer be confirmed.",
    "details": {}
  }
}
```

Errors must have stable machine-readable codes.

## 18. Observability
Record:
- request ID
- actor ID
- branch ID
- action
- result
- timestamp
- error code where applicable

Do not log:
- Firebase tokens
- PINs
- secrets
- sensitive customer authentication data

## 19. Scalability/Migration
Modules must avoid hard dependency on D1-specific behavior where practical.

If the system outgrows D1:
- repository layer can be replaced
- service/business layer remains
- API contracts remain
- frontend remains largely unchanged

Potential future database: PostgreSQL/Supabase or another SQL platform.

## 20. Architecture Rules
1. Server is authoritative.
2. Branch scope is mandatory for branch data.
3. Business logic belongs in services, not UI components.
4. SQL belongs in repositories.
5. Validation is shared where possible but server validation is mandatory.
6. API contracts are explicit.
7. No direct database access from frontend.
8. No duplicated pricing/coupon/inventory logic.
9. Realtime is an infrastructure concern, not business logic.
10. External integrations are adapter-based.
