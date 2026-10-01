import { ORDER_EXPIRY_MINUTES, ORDER_EDIT_WINDOW_MINUTES } from '../constants/business.constants';

/**
 * Calculates when an order expires from the placed timestamp.
 * Returns ISO string in UTC.
 */
export function calculateOrderExpiresAt(placedAt: Date = new Date()): string {
  const expires = new Date(placedAt.getTime() + ORDER_EXPIRY_MINUTES * 60 * 1000);
  return expires.toISOString();
}

/**
 * Checks if an order is still within the allowable operator editing window (1 hour from placement/confirmation).
 */
export function isWithinOrderEditWindow(orderConfirmedOrPlacedAt: Date, now: Date = new Date()): boolean {
  const elapsedMs = now.getTime() - orderConfirmedOrPlacedAt.getTime();
  const maxMs = ORDER_EDIT_WINDOW_MINUTES * 60 * 1000;
  return elapsedMs <= maxMs;
}
