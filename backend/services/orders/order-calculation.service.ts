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

export class OrderCalculationService {
  /**
   * Recalculates order line items and financial totals based strictly
   * on verified database products. Never trusts client-supplied prices.
   */
  calculateTotals(
    requestedItems: Array<{ productId: string; quantity: number }>,
    productsMap: Map<string, Product>,
    taxRate: number = 0.05, // 5% standard food tax rate
  ): CalculatedOrderTotals {
    if (!requestedItems || requestedItems.length === 0) {
      throw new BadRequestError('Order must contain at least one product item');
    }

    let subtotal = 0;
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

      const unitPrice = product.price;
      const lineTotal = Math.round(unitPrice * req.quantity * 100) / 100;
      subtotal = Math.round((subtotal + lineTotal) * 100) / 100;

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

    const discount = 0;
    const tax = Math.round(subtotal * taxRate * 100) / 100;
    const total = Math.round((subtotal - discount + tax) * 100) / 100;

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
   */
  calculateEditDifference(
    previousTotal: number,
    newTotal: number,
    alreadyPaidAmount: number,
  ): { paymentDifference: number; isUnderpaid: boolean; isOverpaid: boolean } {
    const diff = Math.round((newTotal - alreadyPaidAmount) * 100) / 100;
    return {
      paymentDifference: diff,
      isUnderpaid: diff > 0,
      isOverpaid: diff < 0,
    };
  }
}

export const orderCalculationService = new OrderCalculationService();
