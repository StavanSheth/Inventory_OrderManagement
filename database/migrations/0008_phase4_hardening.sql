-- ============================================================================
-- Migration: 0008_phase4_hardening.sql
-- Description: Phase 4 database-level hardening triggers for:
--   1. Payment verification aggregate total <= order total invariant
--   2. Strict single order confirmation from PENDING & VERIFIED state
--   3. Inventory and raw materials negative stock prevention
--   4. Coupon total usage limit, per-user limit, and per-user daily limit enforcement
-- ============================================================================

-- 1. Inventory stock must never become negative
CREATE TRIGGER IF NOT EXISTS trg_prevent_negative_inventory
BEFORE UPDATE OF quantity ON inventory
FOR EACH ROW
WHEN NEW.quantity < 0
BEGIN
  SELECT RAISE(ABORT, 'Inventory stock cannot be negative');
END;

-- 2. Raw materials stock must never become negative
CREATE TRIGGER IF NOT EXISTS trg_prevent_negative_raw_materials
BEFORE UPDATE OF current_quantity ON raw_materials
FOR EACH ROW
WHEN NEW.current_quantity < 0
BEGIN
  SELECT RAISE(ABORT, 'Raw material stock cannot be negative');
END;

-- 3. Total verified payments cannot exceed order total (Status Update)
CREATE TRIGGER IF NOT EXISTS trg_enforce_payment_verified_aggregate_update
BEFORE UPDATE OF status ON payments
FOR EACH ROW
WHEN NEW.status IN ('VERIFIED', 'COMPLETED') AND OLD.status NOT IN ('VERIFIED', 'COMPLETED')
BEGIN
  SELECT RAISE(ABORT, 'Verified payment amount exceeds order total')
  WHERE (
    SELECT COALESCE(SUM(amount), 0)
    FROM payments
    WHERE order_id = NEW.order_id
      AND status IN ('VERIFIED', 'COMPLETED')
      AND id != NEW.id
  ) + NEW.amount > (
    SELECT total FROM orders WHERE id = NEW.order_id
  );
END;

-- 3b. Total verified payments cannot exceed order total (Amount Update on Verified Payment)
CREATE TRIGGER IF NOT EXISTS trg_enforce_payment_verified_amount_update
BEFORE UPDATE OF amount ON payments
FOR EACH ROW
WHEN NEW.status IN ('VERIFIED', 'COMPLETED')
BEGIN
  SELECT RAISE(ABORT, 'Verified payment amount exceeds order total')
  WHERE (
    SELECT COALESCE(SUM(amount), 0)
    FROM payments
    WHERE order_id = NEW.order_id
      AND status IN ('VERIFIED', 'COMPLETED')
      AND id != NEW.id
  ) + NEW.amount > (
    SELECT total FROM orders WHERE id = NEW.order_id
  );
END;

-- 4. Total verified payments cannot exceed order total (Insert)
CREATE TRIGGER IF NOT EXISTS trg_enforce_payment_verified_aggregate_insert
BEFORE INSERT ON payments
FOR EACH ROW
WHEN NEW.status IN ('VERIFIED', 'COMPLETED')
BEGIN
  SELECT RAISE(ABORT, 'Verified payment amount exceeds order total')
  WHERE (
    SELECT COALESCE(SUM(amount), 0)
    FROM payments
    WHERE order_id = NEW.order_id
      AND status IN ('VERIFIED', 'COMPLETED')
  ) + NEW.amount > (
    SELECT total FROM orders WHERE id = NEW.order_id
  );
END;

-- 5. Prevent duplicate confirmation of already confirmed orders
CREATE TRIGGER IF NOT EXISTS trg_prevent_duplicate_order_confirmation
BEFORE UPDATE OF status ON orders
FOR EACH ROW
WHEN NEW.status = 'CONFIRMED' AND OLD.status = 'CONFIRMED'
BEGIN
  SELECT RAISE(ABORT, 'Order is already confirmed');
END;

-- 6. Enforce that orders can only be confirmed if PENDING and payment is VERIFIED
CREATE TRIGGER IF NOT EXISTS trg_enforce_valid_order_confirmation_preconditions
BEFORE UPDATE OF status ON orders
FOR EACH ROW
WHEN NEW.status = 'CONFIRMED' AND OLD.status NOT IN ('CONFIRMED', 'PREPARING', 'READY') AND (
  OLD.status != 'PENDING'
  OR OLD.payment_status != 'VERIFIED'
)
BEGIN
  SELECT RAISE(ABORT, 'Order confirmation requires PENDING status and VERIFIED payment');
END;

-- 7. Enforce coupon total usage limit on increment
CREATE TRIGGER IF NOT EXISTS trg_enforce_coupon_total_usage_limit
BEFORE UPDATE OF usage_count ON coupons
FOR EACH ROW
WHEN NEW.total_usage_limit IS NOT NULL AND NEW.usage_count > NEW.total_usage_limit
BEGIN
  SELECT RAISE(ABORT, 'Coupon total usage limit reached');
END;

-- 8. Enforce per-user coupon usage limit on usage record creation
CREATE TRIGGER IF NOT EXISTS trg_enforce_coupon_per_user_limit
BEFORE INSERT ON coupon_usages
FOR EACH ROW
WHEN (
  SELECT per_user_usage_limit FROM coupons WHERE id = NEW.coupon_id
) IS NOT NULL AND (
  SELECT COUNT(*) FROM coupon_usages WHERE coupon_id = NEW.coupon_id AND user_id = NEW.user_id
) >= (
  SELECT per_user_usage_limit FROM coupons WHERE id = NEW.coupon_id
)
BEGIN
  SELECT RAISE(ABORT, 'Per-user coupon usage limit reached');
END;

-- 9. Enforce per-user daily coupon usage limit on usage record creation
CREATE TRIGGER IF NOT EXISTS trg_enforce_coupon_daily_limit
BEFORE INSERT ON coupon_usages
FOR EACH ROW
WHEN (
  SELECT per_user_daily_limit FROM coupons WHERE id = NEW.coupon_id
) IS NOT NULL AND (
  SELECT COUNT(*) FROM coupon_usages
  WHERE coupon_id = NEW.coupon_id
    AND user_id = NEW.user_id
    AND substr(used_at, 1, 10) = substr(NEW.used_at, 1, 10)
) >= (
  SELECT per_user_daily_limit FROM coupons WHERE id = NEW.coupon_id
)
BEGIN
  SELECT RAISE(ABORT, 'Per-user daily coupon usage limit reached');
END;
