import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateOrderExpiresAt,
  isWithinOrderEditWindow,
  canTransitionOrderStatus,
  assertValidOrderTransition,
  isTerminalOrderStatus,
  canConfirmOrder,
  isOrderEditable,
} from '../../shared/business-rules/order-rules';
import { OrderStatus, PaymentStatus } from '../../shared/enums/order.enum';

describe('Order Rules — Unit Tests', () => {
  describe('Status Transitions & State Machine', () => {
    it('allows valid forward lifecycle transitions', () => {
      assert.strictEqual(canTransitionOrderStatus(OrderStatus.PENDING, OrderStatus.CONFIRMED), true);
      assert.strictEqual(canTransitionOrderStatus(OrderStatus.CONFIRMED, OrderStatus.PREPARING), true);
      assert.strictEqual(canTransitionOrderStatus(OrderStatus.PREPARING, OrderStatus.READY), true);
      assert.strictEqual(canTransitionOrderStatus(OrderStatus.READY, OrderStatus.COMPLETED), true);
    });

    it('allows transitions to terminal cancellation and expiry where permitted', () => {
      assert.strictEqual(canTransitionOrderStatus(OrderStatus.PENDING, OrderStatus.CANCELLED), true);
      assert.strictEqual(canTransitionOrderStatus(OrderStatus.PENDING, OrderStatus.EXPIRED), true);
      assert.strictEqual(canTransitionOrderStatus(OrderStatus.CONFIRMED, OrderStatus.CANCELLED), true);
    });

    it('rejects invalid or backward transitions', () => {
      assert.strictEqual(canTransitionOrderStatus(OrderStatus.PENDING, OrderStatus.COMPLETED), false);
      assert.strictEqual(canTransitionOrderStatus(OrderStatus.COMPLETED, OrderStatus.PREPARING), false);
      assert.strictEqual(canTransitionOrderStatus(OrderStatus.EXPIRED, OrderStatus.CONFIRMED), false);
      assert.strictEqual(canTransitionOrderStatus(OrderStatus.CANCELLED, OrderStatus.PENDING), false);
    });

    it('assertValidOrderTransition throws on invalid transition', () => {
      assert.throws(
        () => assertValidOrderTransition(OrderStatus.EXPIRED, OrderStatus.CONFIRMED),
        /Invalid order status transition/,
      );
    });

    it('identifies terminal statuses correctly', () => {
      assert.strictEqual(isTerminalOrderStatus(OrderStatus.COMPLETED), true);
      assert.strictEqual(isTerminalOrderStatus(OrderStatus.CANCELLED), true);
      assert.strictEqual(isTerminalOrderStatus(OrderStatus.EXPIRED), true);
      assert.strictEqual(isTerminalOrderStatus(OrderStatus.PENDING), false);
      assert.strictEqual(isTerminalOrderStatus(OrderStatus.CONFIRMED), false);
    });
  });

  describe('Expiry Calculation', () => {
    it('calculates expires_at correctly from placed timestamp', () => {
      const placedAt = new Date('2026-10-02T10:00:00.000Z');
      const expiresAt = calculateOrderExpiresAt(placedAt, 15);
      assert.strictEqual(expiresAt, '2026-10-02T10:15:00.000Z');
    });
  });

  describe('Order Confirmation Rules', () => {
    it('allows confirmation when order is PENDING, payment is VERIFIED, and not expired', () => {
      const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const order = {
        status: OrderStatus.PENDING,
        payment_status: PaymentStatus.VERIFIED,
        expires_at: future,
      };
      assert.strictEqual(canConfirmOrder(order), true);
    });

    it('rejects confirmation if payment is not VERIFIED', () => {
      const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      assert.strictEqual(
        canConfirmOrder({ status: OrderStatus.PENDING, payment_status: PaymentStatus.RECORDED, expires_at: future }),
        false,
      );
      assert.strictEqual(
        canConfirmOrder({ status: OrderStatus.PENDING, payment_status: PaymentStatus.PENDING, expires_at: future }),
        false,
      );
    });

    it('rejects confirmation if order has already expired', () => {
      const past = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      assert.strictEqual(
        canConfirmOrder({ status: OrderStatus.PENDING, payment_status: PaymentStatus.VERIFIED, expires_at: past }),
        false,
      );
    });

    it('rejects confirmation if order is not in PENDING status', () => {
      const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      assert.strictEqual(
        canConfirmOrder({ status: OrderStatus.CONFIRMED, payment_status: PaymentStatus.VERIFIED, expires_at: future }),
        false,
      );
    });
  });

  describe('Order Editing Window Rules', () => {
    it('isWithinOrderEditWindow returns true within window and false beyond window', () => {
      const placed = new Date('2026-10-02T10:00:00.000Z');
      const within = new Date('2026-10-02T10:30:00.000Z');
      const beyond = new Date('2026-10-02T11:01:00.000Z');
      assert.strictEqual(isWithinOrderEditWindow(placed, 60, within), true);
      assert.strictEqual(isWithinOrderEditWindow(placed, 60, beyond), false);
    });

    it('allows editing pending order within 60 minutes', () => {
      const now = new Date('2026-10-02T10:30:00.000Z');
      const order = {
        status: OrderStatus.PENDING,
        placed_at: '2026-10-02T10:00:00.000Z',
      };
      assert.strictEqual(isOrderEditable(order, 60, now), true);
    });

    it('allows editing confirmed order within 60 minutes', () => {
      const now = new Date('2026-10-02T10:45:00.000Z');
      const order = {
        status: OrderStatus.CONFIRMED,
        placed_at: '2026-10-02T10:00:00.000Z',
        confirmed_at: '2026-10-02T10:10:00.000Z',
      };
      assert.strictEqual(isOrderEditable(order, 60, now), true);
    });

    it('rejects editing if past 60-minute window', () => {
      const now = new Date('2026-10-02T11:30:00.000Z');
      const order = {
        status: OrderStatus.PENDING,
        placed_at: '2026-10-02T10:00:00.000Z',
      };
      assert.strictEqual(isOrderEditable(order, 60, now), false);
    });

    it('rejects editing terminal orders even if within 60 minutes', () => {
      const now = new Date('2026-10-02T10:20:00.000Z');
      assert.strictEqual(
        isOrderEditable({ status: OrderStatus.COMPLETED, placed_at: '2026-10-02T10:00:00.000Z' }, 60, now),
        false,
      );
      assert.strictEqual(
        isOrderEditable({ status: OrderStatus.CANCELLED, placed_at: '2026-10-02T10:00:00.000Z' }, 60, now),
        false,
      );
      assert.strictEqual(
        isOrderEditable({ status: OrderStatus.EXPIRED, placed_at: '2026-10-02T10:00:00.000Z' }, 60, now),
        false,
      );
    });
  });
});
