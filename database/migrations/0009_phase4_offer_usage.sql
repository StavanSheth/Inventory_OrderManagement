-- ============================================================================
-- Migration: 0009_phase4_offer_usage.sql
-- Description: Phase 4 database-level trigger for offer total usage limit enforcement
-- ============================================================================

-- 1. Enforce offer total usage limit on increment
CREATE TRIGGER IF NOT EXISTS trg_enforce_offer_total_usage_limit
BEFORE UPDATE OF usage_count ON offers
FOR EACH ROW
WHEN NEW.usage_limit IS NOT NULL AND NEW.usage_count > NEW.usage_limit
BEGIN
  SELECT RAISE(ABORT, 'Offer total usage limit reached');
END;
