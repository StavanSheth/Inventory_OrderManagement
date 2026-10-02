-- Migration: 0005_realtime_events.sql
-- Persistent event log for production multi-instance and client reconnection catchup
CREATE TABLE IF NOT EXISTS realtime_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  branch_id TEXT,
  order_id TEXT,
  customer_user_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_realtime_events_order ON realtime_events(order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_realtime_events_branch ON realtime_events(branch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_realtime_events_customer ON realtime_events(customer_user_id, created_at);
