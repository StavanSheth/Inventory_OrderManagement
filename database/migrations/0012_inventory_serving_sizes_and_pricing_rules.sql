-- Phase 8: Inventory Serving Sizes, Custom Price Rates, Tiered Pricing & Order Cancellation Details
ALTER TABLE products ADD COLUMN serving_size TEXT DEFAULT '100g';
ALTER TABLE products ADD COLUMN price_rate REAL DEFAULT 0;
ALTER TABLE products ADD COLUMN serving_sizes_json TEXT DEFAULT '[]';

ALTER TABLE inventory ADD COLUMN serving_size TEXT DEFAULT '100g';
ALTER TABLE inventory ADD COLUMN price_rate REAL DEFAULT 0;
ALTER TABLE inventory ADD COLUMN serving_sizes_json TEXT DEFAULT '[]';

ALTER TABLE orders ADD COLUMN cancellation_reason TEXT;
ALTER TABLE orders ADD COLUMN refund_amount REAL DEFAULT 0;
