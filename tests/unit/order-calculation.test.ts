import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  OrderCalculationService,
  roundCurrency,
  toPaise,
  fromPaise,
} from '../../backend/services/orders/order-calculation.service';
import { Product } from '../../shared/types/entities.types';
import { BadRequestError } from '../../backend/errors/app-error';

describe('Order Calculation — Unit Tests', () => {
  const calc = new OrderCalculationService();

  const mockProducts: Product[] = [
    {
      id: 'prod-vanilla',
      branch_id: 'branch-alpha',
      category_id: 'cat-scoops',
      name: 'Classic Vanilla',
      description: 'Single scoop vanilla ice cream',
      price: 100.5,
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'prod-chocolate',
      branch_id: 'branch-alpha',
      category_id: 'cat-scoops',
      name: 'Dark Chocolate',
      description: 'Single scoop dark chocolate',
      price: 150.25,
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'prod-inactive',
      branch_id: 'branch-alpha',
      category_id: 'cat-scoops',
      name: 'Seasonal Berry',
      description: 'Inactive seasonal scoop',
      price: 120.0,
      active: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const productsMap = new Map<string, Product>(mockProducts.map((p) => [p.id, p]));

  describe('Paise / Minor Unit Arithmetic', () => {
    it('converts between rupees and paise accurately', () => {
      assert.strictEqual(toPaise(100.5), 10050);
      assert.strictEqual(toPaise(150.25), 15025);
      assert.strictEqual(fromPaise(10050), 100.5);
      assert.strictEqual(fromPaise(15025), 150.25);
      assert.strictEqual(roundCurrency(100.504), 100.5);
      assert.strictEqual(roundCurrency(100.506), 100.51);
    });
  });

  describe('Total Calculations from Authoritative Catalog', () => {
    it('calculates subtotal, 5% tax, and total deterministically', () => {
      const items = [
        { productId: 'prod-vanilla', quantity: 2 }, // 100.50 * 2 = 201.00
        { productId: 'prod-chocolate', quantity: 1 }, // 150.25 * 1 = 150.25
      ];
      // Subtotal = 201.00 + 150.25 = 351.25
      // Tax = 5% of 351.25 = 17.5625 -> 17.56
      // Total = 351.25 + 17.56 = 368.81

      const result = calc.calculateTotals(items, productsMap, 0.05);

      assert.strictEqual(result.subtotal, 351.25);
      assert.strictEqual(result.discount, 0);
      assert.strictEqual(result.tax, 17.56);
      assert.strictEqual(result.total, 368.81);
      assert.strictEqual(result.items.length, 2);
      assert.strictEqual(result.items[0].product_name_snapshot, 'Classic Vanilla');
      assert.strictEqual(result.items[0].unit_price_snapshot, 100.5);
      assert.strictEqual(result.items[0].line_total, 201.0);
    });

    it('rejects empty items array', () => {
      assert.throws(
        () => calc.calculateTotals([], productsMap),
        BadRequestError,
      );
    });

    it('rejects non-positive or float quantities', () => {
      assert.throws(
        () => calc.calculateTotals([{ productId: 'prod-vanilla', quantity: 0 }], productsMap),
        BadRequestError,
      );
      assert.throws(
        () => calc.calculateTotals([{ productId: 'prod-vanilla', quantity: -2 }], productsMap),
        BadRequestError,
      );
      assert.throws(
        () => calc.calculateTotals([{ productId: 'prod-vanilla', quantity: 1.5 }], productsMap),
        BadRequestError,
      );
    });

    it('rejects missing or inactive products', () => {
      assert.throws(
        () => calc.calculateTotals([{ productId: 'prod-nonexistent', quantity: 1 }], productsMap),
        BadRequestError,
      );
      assert.throws(
        () => calc.calculateTotals([{ productId: 'prod-inactive', quantity: 1 }], productsMap),
        BadRequestError,
      );
    });
  });
});
