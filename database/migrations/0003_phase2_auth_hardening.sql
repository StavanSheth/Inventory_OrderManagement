-- Phase 2 Authentication & Security Hardening Migration
-- Adds brute-force lockout tracking to users table

ALTER TABLE users ADD COLUMN failed_pin_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN pin_locked_until TEXT NULL;
