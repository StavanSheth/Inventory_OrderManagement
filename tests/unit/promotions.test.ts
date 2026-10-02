import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PromotionsService } from '../../backend/services/promotions';
import { PromotionRepository } from '../../database/repositories/promotion.repository';
import { DiscountType } from '../../shared/enums/promotions.enum';
import { Coupon, Offer, Product } from '../../shared/types/entities.types';
import { OrderCalculationService } from '../../backend/services/orders/order-calculation.service';

// Mock repository for unit testing
function createMockPromoRepo(overrides: {
  coupon?: Coupon | null;
  offer?: Offer | null;
  userUsageCount?: number;
  userDailyUsageCount?: number;
} = {}): PromotionRepository {
  return {
    findCouponByCode: async (_branchId: string, _code: string) => overrides.coupon ?? null,
    getUserUsageCount: async (_couponId: string, _userId: string) => overrides.userUsageCount ?? 0,
    getUserDailyUsageCount: async (_couponId: string, _userId: string) => overrides.userDailyUsageCount ?? 0,
    findOfferById: async (_id: string) => overrides.offer ?? null,
  } as unknown as PromotionRepository;
}

describe('Phase 4 — Promotions & Coupons Unit Tests', () => {
  const branchId = 'branch-alpha';
  const customerId = 'user-customer-1';
  const nowStr = new Date().toISOString();
  const pastStr = new Date(Date.now() - 86400000).toISOString();
  const futureStr = new Date(Date.now() + 86400000).toISOString();

  describe('Coupon Eligibility & Validation Rules', () => {
    it('validates a valid percentage coupon within constraints', async () => {
      const mockCoupon: Coupon = {
        id: 'coupon-1',
        branch_id: branchId,
        code: 'SUMMER20',
        name: 'Summer 20% Off',
        discount_type: DiscountType.PERCENTAGE,
        discount_value: 20,
        max_discount: 100,
        minimum_order_value: 200,
        active: true,
        usage_count: 5,
        total_usage_limit: 100,
        per_user_usage_limit: 2,
        per_user_daily_limit: 1,
        start_at: pastStr,
        end_at: futureStr,
        created_at: nowStr,
        updated_at: nowStr,
      };

      const repo = createMockPromoRepo({ coupon: mockCoupon, userUsageCount: 0, userDailyUsageCount: 0 });
      const service = new PromotionsService(repo);

      const result = await service.validateCoupon({
        branchId,
        code: 'summer20',
        subtotal: 300,
        userId: customerId,
      });

      assert.strictEqual(result.isValid, true);
      // 20% of 300 = 60 <= max_discount 100
      assert.strictEqual(result.discount, 60);
      assert.strictEqual(result.coupon?.code, 'SUMMER20');
    });

    it('caps percentage discount at max_discount', async () => {
      const mockCoupon: Coupon = {
        id: 'coupon-1',
        branch_id: branchId,
        code: 'BIG50',
        name: 'Big 50% Off',
        discount_type: DiscountType.PERCENTAGE,
        discount_value: 50,
        max_discount: 100,
        minimum_order_value: 100,
        active: true,
        usage_count: 0,
        start_at: pastStr,
        end_at: futureStr,
        created_at: nowStr,
        updated_at: nowStr,
      };

      const repo = createMockPromoRepo({ coupon: mockCoupon });
      const service = new PromotionsService(repo);

      const result = await service.validateCoupon({
        branchId,
        code: 'BIG50',
        subtotal: 500, // 50% of 500 = 250, capped at 100
      });

      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.discount, 100);
    });

    it('calculates fixed amount discount without exceeding subtotal', async () => {
      const mockCoupon: Coupon = {
        id: 'coupon-fixed',
        branch_id: branchId,
        code: 'FLAT75',
        name: 'Flat 75 Off',
        discount_type: DiscountType.FIXED,
        discount_value: 75,
        minimum_order_value: 100,
        active: true,
        usage_count: 0,
        start_at: pastStr,
        end_at: futureStr,
        created_at: nowStr,
        updated_at: nowStr,
      };

      const repo = createMockPromoRepo({ coupon: mockCoupon });
      const service = new PromotionsService(repo);

      const result = await service.validateCoupon({
        branchId,
        code: 'FLAT75',
        subtotal: 120,
      });

      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.discount, 75);
    });

    it('rejects coupon when subtotal does not meet minimum_order_value', async () => {
      const mockCoupon: Coupon = {
        id: 'coupon-1',
        branch_id: branchId,
        code: 'MIN500',
        name: 'Min 500',
        discount_type: DiscountType.FIXED,
        discount_value: 50,
        minimum_order_value: 500,
        active: true,
        usage_count: 0,
        start_at: pastStr,
        end_at: futureStr,
        created_at: nowStr,
        updated_at: nowStr,
      };

      const repo = createMockPromoRepo({ coupon: mockCoupon });
      const service = new PromotionsService(repo);

      const result = await service.validateCoupon({
        branchId,
        code: 'MIN500',
        subtotal: 350,
      });

      assert.strictEqual(result.isValid, false);
      assert.match(result.reason ?? '', /minimum order/i);
      assert.strictEqual(result.discount, 0);
    });

    it('rejects inactive coupon', async () => {
      const mockCoupon: Coupon = {
        id: 'coupon-inactive',
        branch_id: branchId,
        code: 'DISABLED',
        name: 'Disabled',
        discount_type: DiscountType.FIXED,
        discount_value: 50,
        minimum_order_value: 0,
        active: false,
        usage_count: 0,
        start_at: pastStr,
        end_at: futureStr,
        created_at: nowStr,
        updated_at: nowStr,
      };

      const repo = createMockPromoRepo({ coupon: mockCoupon });
      const service = new PromotionsService(repo);

      const result = await service.validateCoupon({ branchId, code: 'DISABLED', subtotal: 300 });
      assert.strictEqual(result.isValid, false);
      assert.match(result.reason ?? '', /no longer active/i);
    });

    it('rejects expired coupon', async () => {
      const mockCoupon: Coupon = {
        id: 'coupon-expired',
        branch_id: branchId,
        code: 'EXPIRED10',
        name: 'Expired',
        discount_type: DiscountType.FIXED,
        discount_value: 10,
        minimum_order_value: 0,
        end_at: pastStr,
        start_at: new Date(Date.now() - 172800000).toISOString(),
        active: true,
        usage_count: 0,
        created_at: nowStr,
        updated_at: nowStr,
      };

      const repo = createMockPromoRepo({ coupon: mockCoupon });
      const service = new PromotionsService(repo);

      const result = await service.validateCoupon({ branchId, code: 'EXPIRED10', subtotal: 300 });
      assert.strictEqual(result.isValid, false);
      assert.match(result.reason ?? '', /expired/i);
    });

    it('rejects future coupon that has not yet started', async () => {
      const mockCoupon: Coupon = {
        id: 'coupon-future',
        branch_id: branchId,
        code: 'SOON10',
        name: 'Coming Soon',
        discount_type: DiscountType.FIXED,
        discount_value: 10,
        minimum_order_value: 0,
        start_at: futureStr,
        end_at: new Date(Date.now() + 172800000).toISOString(),
        active: true,
        usage_count: 0,
        created_at: nowStr,
        updated_at: nowStr,
      };

      const repo = createMockPromoRepo({ coupon: mockCoupon });
      const service = new PromotionsService(repo);

      const result = await service.validateCoupon({ branchId, code: 'SOON10', subtotal: 300 });
      assert.strictEqual(result.isValid, false);
      assert.match(result.reason ?? '', /not yet valid/i);
    });

    it('rejects coupon when total_usage_limit reached', async () => {
      const mockCoupon: Coupon = {
        id: 'coupon-maxed',
        branch_id: branchId,
        code: 'MAXED',
        name: 'Maxed',
        discount_type: DiscountType.FIXED,
        discount_value: 20,
        minimum_order_value: 0,
        active: true,
        usage_count: 50,
        total_usage_limit: 50,
        start_at: pastStr,
        end_at: futureStr,
        created_at: nowStr,
        updated_at: nowStr,
      };

      const repo = createMockPromoRepo({ coupon: mockCoupon });
      const service = new PromotionsService(repo);

      const result = await service.validateCoupon({ branchId, code: 'MAXED', subtotal: 300 });
      assert.strictEqual(result.isValid, false);
      assert.match(result.reason ?? '', /usage limit.*reached/i);
    });

    it('rejects coupon when per_user_usage_limit reached', async () => {
      const mockCoupon: Coupon = {
        id: 'coupon-per-user',
        branch_id: branchId,
        code: 'ONCE',
        name: 'Once Per User',
        discount_type: DiscountType.FIXED,
        discount_value: 20,
        minimum_order_value: 0,
        active: true,
        usage_count: 10,
        total_usage_limit: 100,
        per_user_usage_limit: 1,
        start_at: pastStr,
        end_at: futureStr,
        created_at: nowStr,
        updated_at: nowStr,
      };

      const repo = createMockPromoRepo({ coupon: mockCoupon, userUsageCount: 1 });
      const service = new PromotionsService(repo);

      const result = await service.validateCoupon({
        branchId,
        code: 'ONCE',
        subtotal: 300,
        userId: customerId,
      });

      assert.strictEqual(result.isValid, false);
      assert.match(result.reason ?? '', /maximum allowed usages/i);
    });

    it('rejects coupon when per_user_daily_limit reached', async () => {
      const mockCoupon: Coupon = {
        id: 'coupon-daily',
        branch_id: branchId,
        code: 'DAILY',
        name: 'Once Daily',
        discount_type: DiscountType.FIXED,
        discount_value: 20,
        minimum_order_value: 0,
        active: true,
        usage_count: 5,
        total_usage_limit: 100,
        per_user_usage_limit: 5,
        per_user_daily_limit: 1,
        start_at: pastStr,
        end_at: futureStr,
        created_at: nowStr,
        updated_at: nowStr,
      };

      const repo = createMockPromoRepo({ coupon: mockCoupon, userUsageCount: 1, userDailyUsageCount: 1 });
      const service = new PromotionsService(repo);

      const result = await service.validateCoupon({
        branchId,
        code: 'DAILY',
        subtotal: 300,
        userId: customerId,
      });

      assert.strictEqual(result.isValid, false);
      assert.match(result.reason ?? '', /daily limit/i);
    });

    it('rejects coupon if targeted to a different branch', async () => {
      const mockCoupon: Coupon = {
        id: 'coupon-other-branch',
        branch_id: 'branch-beta',
        code: 'BETASPCL',
        name: 'Beta Only',
        discount_type: DiscountType.FIXED,
        discount_value: 25,
        minimum_order_value: 0,
        active: true,
        usage_count: 0,
        start_at: pastStr,
        end_at: futureStr,
        created_at: nowStr,
        updated_at: nowStr,
      };

      const repo = createMockPromoRepo({ coupon: mockCoupon });
      const service = new PromotionsService(repo);

      const result = await service.validateCoupon({
        branchId: 'branch-alpha',
        code: 'BETASPCL',
        subtotal: 300,
      });

      assert.strictEqual(result.isValid, false);
      assert.match(result.reason ?? '', /not valid for this branch/i);
    });
  });

  describe('Order Calculation with Promotions Integration', () => {
    const calc = new OrderCalculationService();
    const mockProducts: Product[] = [
      {
        id: 'prod-pistachio',
        branch_id: branchId,
        category_id: 'cat-1',
        name: 'Pistachio Ice Cream',
        description: 'Rich pistachio',
        price: 200,
        active: true,
        created_at: nowStr,
        updated_at: nowStr,
      },
      {
        id: 'prod-waffle',
        branch_id: branchId,
        category_id: 'cat-1',
        name: 'Waffle Cone',
        description: 'Crisp waffle',
        price: 50,
        active: true,
        created_at: nowStr,
        updated_at: nowStr,
      },
    ];
    const productsMap = new Map<string, Product>(mockProducts.map((p) => [p.id, p]));

    it('correctly calculates subtotal, offer discount, coupon discount, tax on discounted base, and final total', () => {
      // Items: 2 * 200 + 2 * 50 = 500
      const items = [
        { productId: 'prod-pistachio', quantity: 2 },
        { productId: 'prod-waffle', quantity: 2 },
      ];

      // Subtotal = 500.00
      // Discount = 100.00 (50 offer + 50 coupon)
      // Taxable amount = 400.00
      // Tax (5% of 400) = 20.00
      // Total = 400.00 + 20.00 = 420.00

      const result = calc.calculateTotals(items, productsMap, 0.05, {
        offerDiscount: 50,
        couponDiscount: 50,
      });

      assert.strictEqual(result.subtotal, 500);
      assert.strictEqual(result.discount, 100);
      assert.strictEqual(result.offerDiscount, 50);
      assert.strictEqual(result.couponDiscount, 50);
      assert.strictEqual(result.tax, 20);
      assert.strictEqual(result.total, 420);
    });

    it('caps total discount at subtotal so taxable amount does not become negative', () => {
      const items = [{ productId: 'prod-waffle', quantity: 1 }]; // subtotal = 50

      const result = calc.calculateTotals(items, productsMap, 0.05, {
        offerDiscount: 40,
        couponDiscount: 40,
      }); // 80 discount > 50 subtotal

      assert.strictEqual(result.subtotal, 50);
      assert.strictEqual(result.discount, 50); // Capped at subtotal
      assert.strictEqual(result.tax, 0);
      assert.strictEqual(result.total, 0);
    });
  });
});
