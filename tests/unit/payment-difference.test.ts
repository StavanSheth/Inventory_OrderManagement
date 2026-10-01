import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OrderCalculationService } from '../../backend/services/orders/order-calculation.service';

describe('Payment Difference Calculation — Unit Tests', () => {
  const calc = new OrderCalculationService();

  it('calculates additional payment required on upward edit', () => {
    // Old total: 500, Paid: 500, New total: 700 -> +200 required
    const result = calc.calculateEditDifference(500, 700, 500);
    assert.strictEqual(result.paymentDifference, 200);
    assert.strictEqual(result.isUnderpaid, true);
    assert.strictEqual(result.isOverpaid, false);
    assert.strictEqual(result.additionalAmountRequired, 200);
    assert.strictEqual(result.overpaymentAmount, 0);
  });

  it('calculates overpayment/credit on downward edit', () => {
    // Old total: 500, Paid: 500, New total: 400 -> -100 overpaid
    const result = calc.calculateEditDifference(500, 400, 500);
    assert.strictEqual(result.paymentDifference, -100);
    assert.strictEqual(result.isUnderpaid, false);
    assert.strictEqual(result.isOverpaid, true);
    assert.strictEqual(result.additionalAmountRequired, 0);
    assert.strictEqual(result.overpaymentAmount, 100);
  });

  it('calculates zero difference when totals match verified payments', () => {
    const result = calc.calculateEditDifference(500, 500, 500);
    assert.strictEqual(result.paymentDifference, 0);
    assert.strictEqual(result.isUnderpaid, false);
    assert.strictEqual(result.isOverpaid, false);
    assert.strictEqual(result.additionalAmountRequired, 0);
    assert.strictEqual(result.overpaymentAmount, 0);
  });

  it('handles partial historical payments correctly', () => {
    // Order was 500, only 200 was verified paid, new total is 650
    // Additional required = 650 - 200 = 450
    const result = calc.calculateEditDifference(500, 650, 200);
    assert.strictEqual(result.paymentDifference, 450);
    assert.strictEqual(result.isUnderpaid, true);
    assert.strictEqual(result.additionalAmountRequired, 450);
  });

  it('handles fractional paise differences accurately without floating point drift', () => {
    // 500.25 -> 700.75, paid 500.25 -> diff 200.50
    const result = calc.calculateEditDifference(500.25, 700.75, 500.25);
    assert.strictEqual(result.paymentDifference, 200.5);
    assert.strictEqual(result.isUnderpaid, true);
    assert.strictEqual(result.additionalAmountRequired, 200.5);
  });
});
