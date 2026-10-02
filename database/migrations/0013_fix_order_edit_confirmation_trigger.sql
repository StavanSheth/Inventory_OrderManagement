-- Update order confirmation preconditions trigger to allow resets to CONFIRMED on order edit
DROP TRIGGER IF EXISTS trg_enforce_valid_order_confirmation_preconditions;

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
