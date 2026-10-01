# 04 — Database, Data Model & API Contract

## 1. Data Architecture
The database is Cloudflare D1/SQLite.

Every operational entity that belongs to a branch must have `branch_id`.

Global entities may exist without branch scope where appropriate.

## 2. Core Tables

### branches
Purpose: branch identity/configuration.
Fields:
- id
- name
- code
- status
- address/contact fields
- timezone
- created_at
- updated_at

### users
Purpose: application-level identity mapped to Firebase.
Fields:
- id
- firebase_uid
- email
- display_name
- phone
- status
- created_at
- updated_at

### branch_memberships
Purpose: maps users to branches and operational permissions.
Fields:
- id
- user_id
- branch_id
- role
- status
- created_at
- updated_at

Roles should support:
- `OWNER`
- `BRANCH_OPERATOR`
- `CUSTOMER`

The exact UI role model may expose Customer and Owner/Operator contexts while retaining branch membership as the authorization mechanism.

### customer_profiles
Fields:
- id
- user_id
- preferred_branch_id, if needed
- marketing metadata if later required
- created_at
- updated_at

### products
Fields:
- id
- branch_id
- name
- description
- category_id
- price
- active
- image_reference if later used
- created_at
- updated_at

### categories
Fields:
- id
- branch_id
- name
- active
- sort_order

### raw_materials
Fields:
- id
- branch_id
- name
- unit
- current_quantity
- reorder_threshold
- active
- created_at
- updated_at

### product_components
Purpose: optional product-to-raw-material recipe/BOM.
Fields:
- id
- product_id
- raw_material_id
- quantity_required
- unit

### inventory
Purpose: current product stock.
Fields:
- id
- branch_id
- product_id
- quantity
- reorder_threshold
- updated_at

### inventory_movements
Fields:
- id
- branch_id
- inventory_item_type
- product_id nullable
- raw_material_id nullable
- quantity_delta
- movement_type
- reason
- reference_type
- reference_id
- actor_user_id
- created_at

Movement types:
- `ORDER_CONSUMPTION`
- `RAW_MATERIAL_CONSUMPTION`
- `REFILL`
- `ADJUSTMENT`
- `DAMAGE`
- `WASTE`
- `CORRECTION`

### orders
Fields:
- id
- order_number
- branch_id
- customer_user_id
- status
- subtotal
- discount
- tax
- total
- coupon_id nullable
- offer_id nullable
- payment_status
- payment_method
- placed_at
- expires_at
- confirmed_at
- completed_at
- cancelled_at
- last_edited_at
- created_at
- updated_at

### order_items
Fields:
- id
- order_id
- product_id
- product_name_snapshot
- unit_price_snapshot
- quantity
- line_discount
- line_total
- created_at
- updated_at

Snapshots are required so historical orders remain understandable after product names/prices change.

### payments
Fields:
- id
- order_id
- branch_id
- method
- amount
- status
- confirmed_by
- confirmed_at
- created_at
- updated_at

### offers
Fields:
- id
- branch_id
- name
- description
- offer_type
- configuration_json
- start_at
- end_at
- active
- usage_limit
- usage_count
- created_at
- updated_at

### coupons
Fields:
- id
- branch_id
- code
- name
- discount_type
- discount_value
- max_discount
- minimum_order_value
- total_usage_limit
- per_user_usage_limit
- per_user_daily_limit
- start_at
- end_at
- active
- usage_count
- created_at
- updated_at

### coupon_usages
Fields:
- id
- coupon_id
- user_id
- order_id
- discount_amount
- used_at

Must have indexes supporting per-user usage checks.

### branch_settings
Fields:
- id
- branch_id
- session_timeout_value
- session_timeout_unit
- order_expiry_minutes
- order_edit_window_minutes
- other configuration fields
- updated_at

### application_sessions
Fields:
- id
- user_id
- branch_id
- authenticated_at
- pin_verified_at
- expires_at
- revoked_at
- created_at

Do not store plaintext PINs.

### audit_logs
Fields:
- id
- branch_id nullable
- actor_user_id
- action
- entity_type
- entity_id
- metadata_json
- created_at

Audit logs should be protected from normal deletion.

### messaging_campaigns
Dummy WhatsApp feature.
Fields:
- id
- branch_id
- created_by
- audience_type
- filters_json
- message_body
- offer_id nullable
- status
- simulated_count
- created_at

### deletion_jobs
Fields:
- id
- requested_by
- branch_id nullable
- start_at
- end_at
- selected_modules_json
- preview_counts_json
- status
- created_at
- completed_at

## 3. Relationships
```text
users
  └── branch_memberships
        └── branches

users
  └── customer_profiles
        └── orders
              └── order_items
                    └── products

products
  └── product_components
        └── raw_materials

products
  └── inventory
        └── inventory_movements

orders
  └── payments

coupons
  └── coupon_usages
        └── orders
```

## 4. Indexing
Minimum indexes:
- orders(branch_id, created_at)
- orders(branch_id, status)
- orders(customer_user_id, created_at)
- orders(branch_id, order_number)
- orders(expires_at, status)
- order_items(order_id)
- products(branch_id, active)
- inventory(branch_id, product_id)
- inventory_movements(branch_id, created_at)
- coupon_usages(coupon_id, user_id)
- branch_memberships(user_id, branch_id)

## 5. API Conventions
Base:
```text
/api/v1
```

Response:
```json
{
  "success": true,
  "data": {}
}
```

Error:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {}
  }
}
```

## 6. Authentication APIs
```text
GET  /api/v1/auth/me
POST /api/v1/auth/session
POST /api/v1/auth/session/verify-pin
POST /api/v1/auth/session/logout
```

Firebase token is sent with requests; server verifies it.

## 7. Customer APIs
```text
GET  /api/v1/customer/profile
GET  /api/v1/customer/menu
GET  /api/v1/customer/orders
GET  /api/v1/customer/orders/:id
POST /api/v1/customer/orders
POST /api/v1/customer/orders/:id/coupon
GET  /api/v1/customer/orders/:id/status
```

## 8. Operator Order APIs
```text
GET   /api/v1/orders/current
GET   /api/v1/orders/history
GET   /api/v1/orders/:id
PATCH /api/v1/orders/:id
POST  /api/v1/orders/:id/confirm-payment
POST  /api/v1/orders/:id/cancel
```

## 9. Inventory APIs
```text
GET  /api/v1/inventory
GET  /api/v1/inventory/products
GET  /api/v1/inventory/raw-materials
POST /api/v1/inventory/refill
POST /api/v1/inventory/adjust
GET  /api/v1/inventory/movements
```

## 10. Promotion APIs
```text
GET    /api/v1/offers
POST   /api/v1/offers
PATCH  /api/v1/offers/:id
DELETE /api/v1/offers/:id

GET    /api/v1/coupons
POST   /api/v1/coupons
PATCH  /api/v1/coupons/:id
DELETE /api/v1/coupons/:id
GET    /api/v1/coupons/:id/usage
```

## 11. Dashboard APIs
```text
GET /api/v1/dashboard/summary
GET /api/v1/dashboard/trends
GET /api/v1/dashboard/top-products
GET /api/v1/dashboard/inventory
```

Every endpoint takes date range/filter parameters where applicable.

## 12. Branch APIs
```text
GET   /api/v1/branches
POST  /api/v1/branches
GET   /api/v1/branches/:id
PATCH /api/v1/branches/:id
POST  /api/v1/branches/:id/members
PATCH /api/v1/branches/:id/members/:memberId
```

Only global Owner may use global branch-management operations.

## 13. Settings APIs
```text
GET   /api/v1/settings
PATCH /api/v1/settings
```

## 14. Deletion APIs
```text
POST /api/v1/data-deletion/preview
POST /api/v1/data-deletion/execute
GET  /api/v1/data-deletion/:id
```

Deletion requests must be strongly authorized and audited.

## 15. Messaging APIs
Dummy only:
```text
GET  /api/v1/messaging/audiences
POST /api/v1/messaging/campaigns/preview
POST /api/v1/messaging/campaigns/simulate-send
GET  /api/v1/messaging/campaigns
```

No real WhatsApp provider is called.

## 16. Transaction Requirements
The following must be atomic:
- order confirmation + payment + inventory deduction
- coupon redemption + usage increment
- order edit + recalculated totals + inventory adjustment
- refill + inventory movement
- manual adjustment + inventory movement

## 17. Deletion Rules
Deletion must respect foreign-key dependencies.

Recommended approach:
1. preview
2. confirm
3. child records
4. parent records
5. audit record

Never delete audit logs automatically as part of ordinary business-data deletion unless explicitly defined by a future compliance policy.
