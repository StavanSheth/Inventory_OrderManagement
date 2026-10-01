-- Phase 3 Hardening Migration
-- 1. Dedicated order sequence table for collision-free concurrent branch order numbering
CREATE TABLE IF NOT EXISTS order_sequences (
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  date_str TEXT NOT NULL,
  last_seq INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (branch_id, date_str)
);

-- 2. Performance & query indexes for order queue, customer history, and payments
CREATE INDEX IF NOT EXISTS idx_orders_branch_status ON orders(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_user_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
