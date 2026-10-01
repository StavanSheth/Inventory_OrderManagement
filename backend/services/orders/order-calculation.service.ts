import { Product } from '../../../shared/types/entities.types';
import { CreateOrderItemInput } from '../../../database/repositories/order.repository';
import { BadRequestError } from '../../errors/app-error';

export interface CalculatedOrderTotals {
  items: CreateOrderItemInput[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

export interface EditDifferenceResult {
  paymentDifference: number;
  isUnderpaid: boolean;
  isOverpaid: boolean;
  additionalAmountRequired: number;
  overpaymentAmount: number;
}

export function roundCurrency(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function fromPaise(paise: number): number {
  return Math.round(paise) / 100;
}

export class OrderCalculationService {
  /**
   * Recalculates order line items and financial totals based strictly
   * on verified database products using deterministic minor unit arithmetic.
   * Never trusts client-supplied prices.
   */
  calculateTotals(
    requestedItems: Array<{ productId: string; quantity: number }>,
    productsMap: Map<string, Product>,
    taxRate: number = 0.05, // 5% standard food tax rate
  ): CalculatedOrderTotals {
    if (!requestedItems || requestedItems.length === 0) {
      throw new BadRequestError('Order must contain at least one product item');
    }

    let subtotalPaise = 0;
    const items: CreateOrderItemInput[] = [];

    for (const req of requestedItems) {
      if (!req.quantity || typeof req.quantity !== 'number' || req.quantity <= 0 || !Number.isInteger(req.quantity)) {
        throw new BadRequestError(`Invalid quantity for product ${req.productId}. Quantity must be a positive integer.`);
      }

      const product = productsMap.get(req.productId);
      if (!product) {
        throw new BadRequestError(`Product with ID "${req.productId}" does not exist in branch catalog.`);
      }
      if (!product.active) {
        throw new BadRequestError(`Product "${product.name}" is currently inactive.`);
      }

      const unitPrice = roundCurrency(product.price);
      const lineTotalPaise = toPaise(unitPrice) * req.quantity;
      const lineTotal = fromPaise(lineTotalPaise);
      subtotalPaise += lineTotalPaise;

      items.push({
        id: `oi-${crypto.randomUUID()}`,
        product_id: product.id,
        product_name_snapshot: product.name,
        unit_price_snapshot: unitPrice,
        quantity: req.quantity,
        line_discount: 0,
        line_total: lineTotal,
      });
    }

    const subtotal = fromPaise(subtotalPaise);
    const discount = 0;
    const taxPaise = Math.round(subtotalPaise * taxRate);
    const tax = fromPaise(taxPaise);
    const totalPaise = subtotalPaise - toPaise(discount) + taxPaise;
    const total = fromPaise(totalPaise);

    return {
      items,
      subtotal,
      discount,
      tax,
      total,
    };
  }

  /**
   * Calculates financial differences after an order edit.
   * Compares new order total against authoritative already-paid amount from DB.
   */
  calculateEditDifference(
    previousTotal: number,
    newTotal: number,
    alreadyPaidAmount: number,
  ): EditDifferenceResult {
    const _prevRounded = roundCurrency(previousTotal);
    const newRounded = roundCurrency(newTotal);
    const paidRounded = roundCurrency(alreadyPaidAmount);

    const diffPaise = toPaise(newRounded) - toPaise(paidRounded);
    const diff = fromPaise(diffPaise);

    return {
      paymentDifference: diff,
      isUnderpaid: diff > 0,
      isOverpaid: diff < 0,
      additionalAmountRequired: diff > 0 ? diff : 0,
      overpaymentAmount: diff < 0 ? Math.abs(diff) : 0,
    };
  }
}

export const orderCalculationService = new OrderCalculationService();
