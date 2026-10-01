# Database Documentation & D1 Schema

## 1. Database Target

The database is built on **Cloudflare D1 / SQLite**. Foreign key constraints are enforced (`PRAGMA foreign_keys = ON;`).

## 2. Core Entities (21 Tables)

| Table | Purpose | Branch Scoped |
|---|---|:---:|
| `branches` | Branch identity, code, address, timezone, status | Global entity |
| `users` | Application identity mapped to Firebase UID | Global entity |
| `branch_memberships` | Role-based mapping between users and branches | Yes (`branch_id`) |
| `customer_profiles` | Customer preferences and marketing opt-in | Optional |
| `categories` | Product categorization per branch | Yes (`branch_id`) |
| `products` | Finished goods / menu items per branch | Yes (`branch_id`) |
| `raw_materials` | Ingredients / inventory items per branch | Yes (`branch_id`) |
| `product_components` | Bill of materials (recipes linking products to raw materials) | Relational |
| `inventory` | Real-time finished goods stock levels per branch | Yes (`branch_id`) |
| `inventory_movements` | Immutable audit trail of all inventory deductions/refills | Yes (`branch_id`) |
| `orders` | Customer orders, totals, status, lifecycle timestamps | Yes (`branch_id`) |
| `order_items` | Historical item snapshots (`product_name_snapshot`, `unit_price_snapshot`) | Via `order_id` |
| `payments` | Payment transactions linked to orders | Yes (`branch_id`) |
| `offers` | Branch-specific offers and combo configurations | Yes (`branch_id`) |
| `coupons` | Promo codes with usage limits and discount thresholds | Yes (`branch_id`) |
| `coupon_usages` | Per-user, per-order redemption history | Relational |
| `branch_settings` | Operational timeouts (order expiry, edit window) | Yes (`branch_id`) |
| `application_sessions` | Session management with hash/token verification (no plaintext PIN) | Yes (`branch_id`) |
| `audit_logs` | Security & operational audit trail | Yes (nullable) |
| `messaging_campaigns` | Simulated WhatsApp/SMS campaigns | Yes (`branch_id`) |
| `deletion_jobs` | Scoped data purging jobs | Yes (nullable) |

## 3. Required Indexes

- **orders**:
  - `idx_orders_branch_created` on `(branch_id, created_at)`
  - `idx_orders_branch_status` on `(branch_id, status)`
  - `idx_orders_customer_created` on `(customer_user_id, created_at)`
  - `idx_orders_branch_order_number` on `(branch_id, order_number)`
  - `idx_orders_expires_status` on `(expires_at, status)`
- **order_items**:
  - `idx_order_items_order_id` on `(order_id)`
- **products**:
  - `idx_products_branch_active` on `(branch_id, active)`
- **categories**:
  - `idx_categories_branch_active` on `(branch_id, active)`
- **inventory**:
  - `idx_inventory_branch_product` on `(branch_id, product_id)`
- **inventory_movements**:
  - `idx_inventory_movements_branch_created` on `(branch_id, created_at)`
- **coupon_usages**:
  - `idx_coupon_usages_coupon_user` on `(coupon_id, user_id)`
- **branch_memberships**:
  - `idx_branch_memberships_user_branch` on `(user_id, branch_id)`

## 4. Migration & Seed Workflow

```bash
# Run database migrations
npm run db:migrate

# Seed development fixtures
npm run db:seed
```
