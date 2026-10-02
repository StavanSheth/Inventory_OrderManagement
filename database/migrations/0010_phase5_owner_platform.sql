-- Phase 5: Owner Platform & Order History Optimization Indexes
CREATE INDEX IF NOT EXISTS idx_orders_branch_placed ON orders(branch_id, placed_at);
CREATE INDEX IF NOT EXISTS idx_orders_placed ON orders(placed_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer_placed ON orders(customer_user_id, placed_at);
