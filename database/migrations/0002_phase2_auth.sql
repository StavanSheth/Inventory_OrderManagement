-- 0002_phase2_auth.sql
-- Phase 2 migration: Authentication, RBAC, PIN security, and Application Sessions with Global Scope support.

-- 1. Add role and pin_hash to users table
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'CUSTOMER' CHECK(role IN ('CUSTOMER', 'OWNER'));
ALTER TABLE users ADD COLUMN pin_hash TEXT;

-- Index users by role for fast role lookups
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 2. Upgrade application_sessions to support:
--    - Nullable branch_id for Owner GLOBAL sessions (where scope = 'GLOBAL')
--    - session_token_hash for secure session lookup
--    - scope ('BRANCH' or 'GLOBAL')
CREATE TABLE IF NOT EXISTS application_sessions_new (
  id TEXT PRIMARY KEY,
  session_token_hash TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'BRANCH' CHECK(scope IN ('BRANCH', 'GLOBAL')),
  authenticated_at TEXT NOT NULL,
  pin_verified_at TEXT,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  CHECK (
    (scope = 'GLOBAL' AND branch_id IS NULL) OR
    (scope = 'BRANCH' AND branch_id IS NOT NULL)
  )
);

-- Copy existing session records if any
INSERT INTO application_sessions_new (
  id, session_token_hash, user_id, branch_id, scope, authenticated_at, pin_verified_at, expires_at, revoked_at, created_at
)
SELECT
  id,
  id,
  user_id,
  branch_id,
  'BRANCH',
  authenticated_at,
  pin_verified_at,
  expires_at,
  revoked_at,
  created_at
FROM application_sessions;

DROP TABLE application_sessions;

ALTER TABLE application_sessions_new RENAME TO application_sessions;

CREATE INDEX IF NOT EXISTS idx_sessions_user ON application_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON application_sessions(session_token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_branch ON application_sessions(branch_id);
