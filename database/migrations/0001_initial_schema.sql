-- 0001_initial_schema.sql
-- Initial schema for multi-branch Ice Cream Ordering + Inventory Management platform on Cloudflare D1 / SQLite.

PRAGMA foreign_keys = ON;

-- 1. branches
CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  address TEXT,
  phone TEXT,
  email TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 2. users (maps to Firebase Authentication identity)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  firebase_uid TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 3. branch_memberships
CREATE TABLE IF NOT EXISTS branch_memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, branch_id)
);

-- 4. customer_profiles
CREATE TABLE IF NOT EXISTS customer_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  preferred_branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
  marketing_opt_in INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 5. categories
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 6. products
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL CHECK(price >= 0),
  active INTEGER NOT NULL DEFAULT 1,
  image_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 7. raw_materials
CREATE TABLE IF NOT EXISTS raw_materials (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  current_quantity REAL NOT NULL DEFAULT 0 CHECK(current_quantity >= 0),
  reorder_threshold REAL NOT NULL DEFAULT 0 CHECK(reorder_threshold >= 0),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 8. product_components (recipe / bill of materials)
CREATE TABLE IF NOT EXISTS product_components (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  raw_material_id TEXT NOT NULL REFERENCES raw_materials(id) ON DELETE CASCADE,
  quantity_required REAL NOT NULL CHECK(quantity_required > 0),
  unit TEXT NOT NULL
);

-- 9. inventory (finished product stock)
CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
  reorder_threshold INTEGER NOT NULL DEFAULT 0 CHECK(reorder_threshold >= 0),
  updated_at TEXT NOT NULL,
  UNIQUE(branch_id, product_id)
);

-- 10. inventory_movements
CREATE TABLE IF NOT EXISTS inventory_movements (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  inventory_item_type TEXT NOT NULL,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  raw_material_id TEXT REFERENCES raw_materials(id) ON DELETE SET NULL,
  quantity_delta REAL NOT NULL,
  movement_type TEXT NOT NULL,
  reason TEXT,
  reference_type TEXT,
  reference_id TEXT,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

-- 11. offers
CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  offer_type TEXT NOT NULL,
  configuration_json TEXT NOT NULL DEFAULT '{}',
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  usage_limit INTEGER,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 12. coupons
CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  discount_type TEXT NOT NULL,
  discount_value REAL NOT NULL CHECK(discount_value >= 0),
  max_discount REAL,
  minimum_order_value REAL NOT NULL DEFAULT 0 CHECK(minimum_order_value >= 0),
  total_usage_limit INTEGER,
  per_user_usage_limit INTEGER,
  per_user_daily_limit INTEGER,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(branch_id, code)
);

-- 13. orders
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  customer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL,
  subtotal REAL NOT NULL DEFAULT 0 CHECK(subtotal >= 0),
  discount REAL NOT NULL DEFAULT 0 CHECK(discount >= 0),
  tax REAL NOT NULL DEFAULT 0 CHECK(tax >= 0),
  total REAL NOT NULL DEFAULT 0 CHECK(total >= 0),
  coupon_id TEXT REFERENCES coupons(id) ON DELETE SET NULL,
  offer_id TEXT REFERENCES offers(id) ON DELETE SET NULL,
  payment_status TEXT NOT NULL DEFAULT 'PENDING',
  payment_method TEXT,
  placed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  confirmed_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  last_edited_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(branch_id, order_number)
);

-- 14. order_items
CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name_snapshot TEXT NOT NULL,
  unit_price_snapshot REAL NOT NULL CHECK(unit_price_snapshot >= 0),
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  line_discount REAL NOT NULL DEFAULT 0 CHECK(line_discount >= 0),
  line_total REAL NOT NULL CHECK(line_total >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 15. payments
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  method TEXT NOT NULL,
  amount REAL NOT NULL CHECK(amount >= 0),
  status TEXT NOT NULL DEFAULT 'PENDING',
  confirmed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 16. coupon_usages
CREATE TABLE IF NOT EXISTS coupon_usages (
  id TEXT PRIMARY KEY,
  coupon_id TEXT NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  discount_amount REAL NOT NULL CHECK(discount_amount >= 0),
  used_at TEXT NOT NULL
);

-- 17. branch_settings
CREATE TABLE IF NOT EXISTS branch_settings (
  id TEXT PRIMARY KEY,
  branch_id TEXT UNIQUE NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  session_timeout_value INTEGER NOT NULL DEFAULT 8,
  session_timeout_unit TEXT NOT NULL DEFAULT 'HOURS',
  order_expiry_minutes INTEGER NOT NULL DEFAULT 15,
  order_edit_window_minutes INTEGER NOT NULL DEFAULT 60,
  configuration_json TEXT DEFAULT '{}',
  updated_at TEXT NOT NULL
);

-- 18. application_sessions (no plaintext PINs stored)
CREATE TABLE IF NOT EXISTS application_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  authenticated_at TEXT NOT NULL,
  pin_verified_at TEXT,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

-- 19. audit_logs (append-only log)
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL
);

-- 20. messaging_campaigns (dummy WhatsApp campaign workflow)
CREATE TABLE IF NOT EXISTS messaging_campaigns (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  audience_type TEXT NOT NULL,
  filters_json TEXT DEFAULT '{}',
  message_body TEXT NOT NULL,
  offer_id TEXT REFERENCES offers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  simulated_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- 21. deletion_jobs
CREATE TABLE IF NOT EXISTS deletion_jobs (
  id TEXT PRIMARY KEY,
  requested_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  selected_modules_json TEXT NOT NULL DEFAULT '[]',
  preview_counts_json TEXT DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT NOT NULL,
  completed_at TEXT
);

-- Indexes for performance & branch queries

-- orders indexes
CREATE INDEX IF NOT EXISTS idx_orders_branch_created ON orders (branch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_branch_status ON orders (branch_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_customer_created ON orders (customer_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_branch_order_number ON orders (branch_id, order_number);
CREATE INDEX IF NOT EXISTS idx_orders_expires_status ON orders (expires_at, status);

-- order_items index
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);

-- products index
CREATE INDEX IF NOT EXISTS idx_products_branch_active ON products (branch_id, active);

-- categories index
CREATE INDEX IF NOT EXISTS idx_categories_branch_active ON categories (branch_id, active);

-- inventory index
CREATE INDEX IF NOT EXISTS idx_inventory_branch_product ON inventory (branch_id, product_id);

-- inventory_movements index
CREATE INDEX IF NOT EXISTS idx_inventory_movements_branch_created ON inventory_movements (branch_id, created_at);

-- coupon_usages index
CREATE INDEX IF NOT EXISTS idx_coupon_usages_coupon_user ON coupon_usages (coupon_id, user_id);

-- branch_memberships index
CREATE INDEX IF NOT EXISTS idx_branch_memberships_user_branch ON branch_memberships (user_id, branch_id);
