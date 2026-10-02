-- Migration: 0007_phase4_promotions_snapshot.sql
-- Adds promotion snapshot columns to orders and performance indexes for Phase 4

ALTER TABLE orders ADD COLUMN coupon_code_snapshot TEXT;
ALTER TABLE orders ADD COLUMN coupon_discount_snapshot REAL DEFAULT 0;
ALTER TABLE orders ADD COLUMN offer_discount_snapshot REAL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_raw_materials_branch ON raw_materials(branch_id, active);
CREATE INDEX IF NOT EXISTS idx_product_components_product ON product_components(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_branch ON inventory_movements(branch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_coupon_user ON coupon_usages(coupon_id, user_id);
CREATE INDEX IF NOT EXISTS idx_coupons_branch_active ON coupons(branch_id, active);
CREATE INDEX IF NOT EXISTS idx_offers_branch_active ON offers(branch_id, active);
