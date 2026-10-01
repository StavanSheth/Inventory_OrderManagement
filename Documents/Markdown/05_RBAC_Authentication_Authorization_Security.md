# 05 — RBAC, Authentication, Authorization & Security Rules

## 1. Security Model
The platform has three authorization contexts:
1. Customer
2. Branch Operator
3. Global Owner

"Reception" is not a separate role. Reception users operate as Branch Operators.

## 2. Identity vs Authorization
Firebase Authentication answers:
> Who is this user?

Application database answers:
> What can this user do and which branches can they access?

Never treat a Firebase UID alone as permission to access business data.

## 3. Customer
Authentication:
- Firebase Google Sign-In.
- Google login is mandatory.
- No email/password.
- No password reset.
- No email verification.

Authorization:
- Can read own profile.
- Can read own orders.
- Can create orders for an allowed active branch/menu context.
- Can view own order status.
- Cannot confirm payment.
- Cannot modify inventory.
- Cannot modify offers/coupons.
- Cannot access owner APIs.
- Cannot read other customers' orders.

## 4. Branch Operator
Authentication:
- Google-based identity.
- Application branch membership.
- Branch-specific PIN.
- Configurable session timeout.

Authorization:
- Read/write assigned branch operations.
- Current orders.
- Payment confirmation.
- Order editing.
- Inventory.
- Offers.
- Coupons.
- Branch dashboard.
- Branch settings permitted to operators.
- Dummy messaging.

Cannot:
- access another branch's operational records
- alter global branch configuration
- access owner-only deletion controls unless explicitly granted

## 5. Global Owner
Global Owner can:
- view all branches
- switch branch context
- access all branch data
- create/edit/deactivate branches
- manage branch memberships
- view global dashboard
- perform deletion workflows
- manage global settings

## 6. Branch Isolation
Every branch-scoped query must enforce:
```text
authenticated user
+
authorized branch membership
+
requested entity.branch_id
```

Never trust a branch ID supplied by the frontend without authorization verification.

## 7. Role Matrix
| Capability | Customer | Branch Operator | Global Owner |
|---|---:|---:|---:|
| Google login | Yes | Yes | Yes |
| Own profile | Yes | Yes | Yes |
| Create order | Yes | Optional operational support | Optional |
| Own order history | Yes | No/operational history instead | Yes |
| Branch current orders | No | Yes | Yes |
| Confirm payment | No | Yes | Yes |
| Edit orders | No | Yes | Yes |
| Inventory | No | Yes | Yes |
| Offers | No | Yes | Yes |
| Coupons | No | Yes | Yes |
| Branch dashboard | No | Yes | Yes |
| All-branch dashboard | No | No | Yes |
| Branch management | No | No | Yes |
| Data deletion | No | No by default | Yes |
| Dummy WhatsApp campaign | No | Yes | Yes |
| Global settings | No | No | Yes |

## 8. PIN Security
- Never store plaintext PIN.
- Store a strong one-way hash.
- Rate-limit attempts.
- Lock or delay after repeated failures.
- Never expose PIN in API responses.
- PIN verification creates/refreshes application session.
- Session timeout is configurable.

## 9. Session Timeout
Configuration:
```text
value = numeric
unit = MINUTES | HOURS | DAYS
```

Example:
```text
30 MINUTES
8 HOURS
1 DAY
7 DAYS
```

Session record includes:
- user
- branch
- authenticated time
- PIN verification time
- expiry
- revocation

Server validates expiry for protected operations.

## 10. Sensitive Operations
Fresh PIN/session verification may be required for:
- deletion
- branch access changes
- large stock adjustments
- coupon deletion
- global settings
- other configurable sensitive actions

## 11. API Authorization
Authorization must happen server-side before business logic.

Order:
```text
authenticate
 -> identify user
 -> identify role
 -> resolve branch scope
 -> authorize action
 -> validate request
 -> execute business logic
```

Do not reverse this order.

## 12. Object-Level Authorization
For every object:
- verify user can access its branch
- verify customer owns the order where customer access is used
- verify operator belongs to branch
- verify global owner privilege for cross-branch access

## 13. Customer Order Access
Customer request:
```text
GET /orders/123
```

Server must verify:
```text
order.customer_user_id == authenticated_user.id
```

It must not merely check that the user is logged in.

## 14. Owner Cross-Branch Access
Global Owner can request:
```text
branch_id = A
branch_id = B
all branches
```

The API must explicitly recognize the global owner permission.

## 15. Input Validation
Validate:
- quantities
- prices where client input exists
- coupon codes
- IDs
- dates
- date ranges
- branch IDs
- session configuration
- inventory adjustments

Never trust totals sent from the client.

## 16. Price Security
The client may send:
```text
product_id
quantity
coupon_code
```

The server resolves:
- product price
- active product status
- promotion
- coupon eligibility
- discount
- total

The client-provided total is never authoritative.

## 17. Coupon Security
Coupon redemption must be atomic.

Check:
- active period
- branch
- product/category applicability
- minimum order
- total usage
- per-user usage
- per-user daily usage

Prevent race-condition double redemption using transactional database logic.

## 18. Inventory Security
Inventory changes only through authorized services.

Do not allow:
```text
PATCH /inventory/123
{ "quantity": 99999 }
```

without an auditable adjustment workflow.

Every manual adjustment requires:
- actor
- reason
- old quantity
- delta
- resulting quantity
- timestamp

## 19. Order State Security
Valid state transitions must be defined.

Example:
```text
PENDING_PAYMENT -> CONFIRMED
PENDING_PAYMENT -> EXPIRED
PENDING_PAYMENT -> CANCELLED
CONFIRMED -> COMPLETED
CONFIRMED -> edited CONFIRMED
```

Invalid transitions must return stable errors.

## 20. Realtime Security
Realtime events must be scoped:
- customer receives only own order events
- branch operator receives assigned branch events
- global owner can receive global/selected branch events

Do not broadcast full order data globally.

## 21. Data Deletion Security
Only Global Owner by default.

Workflow:
```text
authorize
 -> preview
 -> explicit confirmation
 -> execute
 -> audit
```

Branch operators cannot delete another branch's data.

## 22. Audit Requirements
Audit high-impact actions:
- payment confirmation
- order edits
- inventory adjustments
- refills
- coupon changes
- offer changes
- branch membership changes
- settings changes
- deletion operations

## 23. Secret Management
Never commit:
- Firebase service credentials
- private keys
- PIN hashes generated from secrets
- API keys
- Cloudflare secrets

Use environment/secret management.

## 24. Security Principle
The frontend is untrusted.

All critical rules must be enforced on the backend:
- role
- branch
- price
- coupon
- inventory
- order status
- payment confirmation
- deletion
