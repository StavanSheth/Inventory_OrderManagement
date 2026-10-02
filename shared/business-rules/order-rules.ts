import { ORDER_EXPIRY_MINUTES, ORDER_EDIT_WINDOW_MINUTES } from '../constants/business.constants';
import { OrderStatus, PaymentStatus } from '../enums/order.enum';

/**
 * Calculates when an order expires from the placed timestamp.
 * Returns ISO string in UTC.
 */
export function calculateOrderExpiresAt(
  placedAt: Date = new Date(),
  expiryMinutes: number = ORDER_EXPIRY_MINUTES,
): string {
  const expires = new Date(placedAt.getTime() + expiryMinutes * 60 * 1000);
  return expires.toISOString();
}

/**
 * Checks if an order is still within the allowable operator editing window (default 60 minutes).
 */
export function isWithinOrderEditWindow(
  orderConfirmedOrPlacedAt: Date,
  editWindowMinutes: number = ORDER_EDIT_WINDOW_MINUTES,
  now: Date = new Date(),
): boolean {
  const elapsedMs = now.getTime() - orderConfirmedOrPlacedAt.getTime();
  const maxMs = editWindowMinutes * 60 * 1000;
  return elapsedMs <= maxMs && elapsedMs >= 0;
}

/**
 * State machine definition for valid OrderStatus transitions.
 */
export const VALID_ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED, OrderStatus.EXPIRED],
  [OrderStatus.CONFIRMED]: [OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.CONFIRMED],
  [OrderStatus.READY]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.CONFIRMED],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.EXPIRED]: [],
};

export function canTransitionOrderStatus(currentStatus: OrderStatus, nextStatus: OrderStatus): boolean {
  if (currentStatus === nextStatus) {
    return true;
  }
  const allowed = VALID_ORDER_TRANSITIONS[currentStatus];
  return Boolean(allowed && allowed.includes(nextStatus));
}

export function assertValidOrderTransition(currentStatus: OrderStatus, nextStatus: OrderStatus): void {
  if (!canTransitionOrderStatus(currentStatus, nextStatus)) {
    throw new Error(`Invalid order status transition from "${currentStatus}" to "${nextStatus}".`);
  }
}

export function isTerminalOrderStatus(status: OrderStatus): boolean {
  return [OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.EXPIRED].includes(status);
}

export function canConfirmOrder(order: {
  status: OrderStatus;
  expires_at: string;
  payment_status?: PaymentStatus;
}): boolean {
  if (order.status !== OrderStatus.PENDING) {
    return false;
  }
  const now = new Date();
  const expiry = new Date(order.expires_at);
  if (now >= expiry) {
    return false;
  }
  return (
    order.payment_status === PaymentStatus.VERIFIED ||
    order.payment_status === PaymentStatus.COMPLETED
  );
}

export function isOrderEditable(
  order: { status: OrderStatus; placed_at: string; confirmed_at?: string | null; expires_at?: string },
  editWindowMinutes: number = ORDER_EDIT_WINDOW_MINUTES,
  now: Date = new Date(),
): boolean {
  if (
    order.status === OrderStatus.COMPLETED ||
    order.status === OrderStatus.EXPIRED ||
    order.status === OrderStatus.CANCELLED
  ) {
    return false;
  }
  if (order.status === OrderStatus.PENDING && order.expires_at) {
    if (now.getTime() >= new Date(order.expires_at).getTime()) {
      return false;
    }
  }
  const referenceDate = new Date(order.confirmed_at ?? order.placed_at);
  return isWithinOrderEditWindow(referenceDate, editWindowMinutes, now);
}

export interface SimpleOrderItemCalculationInput {
  unitPrice: number;
  quantity: number;
  taxRate?: number;
}

export interface SimpleOrderCalculationResult {
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
}

export function calculateOrderTotals(
  items: SimpleOrderItemCalculationInput[],
  taxRate: number = 0.05,
): SimpleOrderCalculationResult {
  let subtotalPaise = 0;
  for (const it of items) {
    const unitPaise = Math.round(it.unitPrice * 100);
    subtotalPaise += unitPaise * it.quantity;
  }
  const taxPaise = Math.round(subtotalPaise * taxRate);
  const totalPaise = subtotalPaise + taxPaise;
  return {
    subtotal: subtotalPaise / 100,
    tax: taxPaise / 100,
    discount: 0,
    total: totalPaise / 100,
  };
}

export interface EditDifferenceResult {
  paymentDifference: number;
  isUnderpaid: boolean;
  isOverpaid: boolean;
  additionalAmountRequired: number;
  overpaymentAmount: number;
  refundCreditAmount: number;
}

export function calculateEditDifference(
  previousTotal: number,
  newTotal: number,
  alreadyPaidAmount: number,
): EditDifferenceResult {
  const newPaise = Math.round(newTotal * 100);
  const paidPaise = Math.round(alreadyPaidAmount * 100);

  const diffPaise = newPaise - paidPaise;
  const diff = diffPaise / 100;
  const overpaid = diff < 0 ? Math.abs(diff) : 0;

  return {
    paymentDifference: diff,
    isUnderpaid: diff > 0,
    isOverpaid: diff < 0,
    additionalAmountRequired: diff > 0 ? diff : 0,
    overpaymentAmount: overpaid,
    refundCreditAmount: overpaid,
  };
}

