-- Migration: 0006_phase3_hardening.sql
-- Phase 3 Hardening: Durable realtime tickets, System actor audit logs, Expired_at timestamp, and Concurrent payment protection

-- 1. Durable single-use tickets for realtime SSE connections across Worker isolates
CREATE TABLE IF NOT EXISTS realtime_tickets (
  ticket TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_context_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_realtime_tickets_expiry ON realtime_tickets(expires_at);

-- 2. Audit logs upgrade: actor_type column and nullable actor_user_id for SYSTEM actor cron jobs
CREATE TABLE IF NOT EXISTS audit_logs_v2 (
  id TEXT PRIMARY KEY,
  branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
  actor_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  actor_type TEXT NOT NULL DEFAULT 'USER',
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL
);

INSERT INTO audit_logs_v2 (id, branch_id, actor_user_id, actor_type, action, entity_type, entity_id, metadata_json, created_at)
SELECT id, branch_id, actor_user_id, 'USER', action, entity_type, entity_id, metadata_json, created_at FROM audit_logs;

DROP TABLE audit_logs;
ALTER TABLE audit_logs_v2 RENAME TO audit_logs;

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_branch ON audit_logs(branch_id);

-- 3. Dedicated expired_at timestamp for orders to eliminate semantic overloading of cancelled_at
ALTER TABLE orders ADD COLUMN expired_at TEXT;

-- 4. Unique partial index: strictly at most one unverified (RECORDED) payment per order at any time
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_order_recorded ON payments(order_id) WHERE status = 'RECORDED';
