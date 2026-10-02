-- 0014_user_private_coupons.sql
-- Store targeted / private promo codes sent to specific customers from the messaging module

CREATE TABLE IF NOT EXISTS user_private_coupons (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coupon_code TEXT NOT NULL,
  title TEXT NOT NULL,
  discount_type TEXT NOT NULL DEFAULT 'PERCENTAGE',
  discount_value REAL NOT NULL DEFAULT 10,
  min_order_value REAL NOT NULL DEFAULT 0,
  max_discount REAL,
  branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  is_claimed INTEGER NOT NULL DEFAULT 0,
  campaign_id TEXT REFERENCES messaging_campaigns(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_private_coupons_user ON user_private_coupons(user_id, is_claimed);
CREATE INDEX IF NOT EXISTS idx_user_private_coupons_code ON user_private_coupons(coupon_code);
