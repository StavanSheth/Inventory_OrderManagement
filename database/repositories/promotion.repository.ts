import { BaseRepository } from './base.repository';
import { Offer, Coupon, CouponUsage } from '../../shared/types/entities.types';
import { OfferType, DiscountType } from '../../shared/enums/promotions.enum';
import { D1PreparedStatementLike } from '../types';

export interface CreateOfferInput {
  id?: string;
  branch_id: string;
  name: string;
  description?: string | null;
  offer_type: OfferType;
  configuration_json?: string;
  start_at?: string;
  end_at?: string | null;
  active?: boolean;
  usage_limit?: number | null;
}

export interface CreateCouponInput {
  id?: string;
  branch_id: string;
  code: string;
  name: string;
  discount_type: DiscountType;
  discount_value: number;
  max_discount?: number | null;
  minimum_order_value?: number;
  total_usage_limit?: number | null;
  per_user_usage_limit?: number | null;
  per_user_daily_limit?: number | null;
  start_at: string;
  end_at: string;
  active?: boolean;
}

export type UpdateOfferInput = Partial<Omit<CreateOfferInput, 'id' | 'branch_id'>>;
export type UpdateCouponInput = Partial<Omit<CreateCouponInput, 'id' | 'branch_id'>>;

export class PromotionRepository extends BaseRepository {
  // ==========================================
  // Offers
  // ==========================================

  async findOfferById(id: string): Promise<Offer | null> {
    return this.db
      .prepare('SELECT * FROM offers WHERE id = ?')
      .bind(id)
      .first<Offer>();
  }

  async listOffersByBranch(branchId: string, onlyActive: boolean = true): Promise<Offer[]> {
    if (onlyActive) {
      const res = await this.db
        .prepare('SELECT * FROM offers WHERE branch_id = ? AND active = 1 ORDER BY created_at DESC')
        .bind(branchId)
        .all<Offer>();
      return res.results;
    }
    const res = await this.db
      .prepare('SELECT * FROM offers WHERE branch_id = ? ORDER BY created_at DESC')
      .bind(branchId)
      .all<Offer>();
    return res.results;
  }

  async createOffer(input: CreateOfferInput): Promise<Offer> {
    const id = input.id ?? `off_${crypto.randomUUID().replace(/-/g, '')}`;
    const now = new Date().toISOString();
    const active = input.active !== false ? 1 : 0;
    const configJson = input.configuration_json ?? '{}';
    const startAt = input.start_at ?? now;
    const endAt = input.end_at ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    await this.db
      .prepare(`
        INSERT INTO offers (
          id, branch_id, name, description, offer_type, configuration_json,
          start_at, end_at, active, usage_limit, usage_count, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `)
      .bind(
        id,
        input.branch_id,
        input.name,
        input.description ?? null,
        input.offer_type,
        configJson,
        startAt,
        endAt,
        active,
        input.usage_limit ?? null,
        now,
        now,
      )
      .run();

    const created = await this.findOfferById(id);
    if (!created) {
      throw new Error(`Failed to retrieve newly created offer ${id}`);
    }
    return created;
  }

  async updateOffer(id: string, updates: Partial<CreateOfferInput>): Promise<Offer> {
    const now = new Date().toISOString();
    const existing = await this.findOfferById(id);
    if (!existing) {
      throw new Error(`Offer ${id} not found`);
    }

    const name = updates.name ?? existing.name;
    const description = updates.description !== undefined ? updates.description : existing.description;
    const offerType = updates.offer_type ?? existing.offer_type;
    const configJson = updates.configuration_json ?? existing.configuration_json;
    const startAt = updates.start_at ?? existing.start_at;
    const endAt = updates.end_at ?? existing.end_at;
    const active = updates.active !== undefined ? (updates.active ? 1 : 0) : (existing.active ? 1 : 0);
    const usageLimit = updates.usage_limit !== undefined ? updates.usage_limit : existing.usage_limit;

    await this.db
      .prepare(`
        UPDATE offers
        SET name = ?, description = ?, offer_type = ?, configuration_json = ?,
            start_at = ?, end_at = ?, active = ?, usage_limit = ?, updated_at = ?
        WHERE id = ?
      `)
      .bind(name, description, offerType, configJson, startAt, endAt, active, usageLimit, now, id)
      .run();

    const updated = await this.findOfferById(id);
    if (!updated) {
      throw new Error(`Offer ${id} not found after update`);
    }
    return updated;
  }

  async deactivateOffer(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare('UPDATE offers SET active = 0, updated_at = ? WHERE id = ?')
      .bind(now, id)
      .run();
  }

  // ==========================================
  // Coupons
  // ==========================================

  async findCouponById(id: string): Promise<Coupon | null> {
    return this.db
      .prepare('SELECT * FROM coupons WHERE id = ?')
      .bind(id)
      .first<Coupon>();
  }

  async findCouponByCode(branchId: string, code: string): Promise<Coupon | null> {
    const normalized = code.trim().toUpperCase();
    return this.db
      .prepare('SELECT * FROM coupons WHERE branch_id = ? AND UPPER(code) = ?')
      .bind(branchId, normalized)
      .first<Coupon>();
  }

  async listCouponsByBranch(branchId: string, onlyActive: boolean = true): Promise<Coupon[]> {
    if (onlyActive) {
      const res = await this.db
        .prepare('SELECT * FROM coupons WHERE branch_id = ? AND active = 1 ORDER BY created_at DESC')
        .bind(branchId)
        .all<Coupon>();
      return res.results;
    }
    const res = await this.db
      .prepare('SELECT * FROM coupons WHERE branch_id = ? ORDER BY created_at DESC')
      .bind(branchId)
      .all<Coupon>();
    return res.results;
  }

  async createCoupon(input: CreateCouponInput): Promise<Coupon> {
    const id = input.id ?? `coup_${crypto.randomUUID().replace(/-/g, '')}`;
    const now = new Date().toISOString();
    const active = input.active !== false ? 1 : 0;
    const normalizedCode = input.code.trim().toUpperCase();
    const minOrderVal = input.minimum_order_value ?? 0;

    await this.db
      .prepare(`
        INSERT INTO coupons (
          id, branch_id, code, name, discount_type, discount_value, max_discount,
          minimum_order_value, total_usage_limit, per_user_usage_limit, per_user_daily_limit,
          start_at, end_at, active, usage_count, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `)
      .bind(
        id,
        input.branch_id,
        normalizedCode,
        input.name,
        input.discount_type,
        input.discount_value,
        input.max_discount ?? null,
        minOrderVal,
        input.total_usage_limit ?? null,
        input.per_user_usage_limit ?? null,
        input.per_user_daily_limit ?? null,
        input.start_at ?? now,
        input.end_at ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        active,
        now,
        now,
      )
      .run();

    const created = await this.findCouponById(id);
    if (!created) {
      throw new Error(`Failed to retrieve newly created coupon ${id}`);
    }
    return created;
  }

  async updateCoupon(id: string, updates: Partial<CreateCouponInput>): Promise<Coupon> {
    const now = new Date().toISOString();
    const existing = await this.findCouponById(id);
    if (!existing) {
      throw new Error(`Coupon ${id} not found`);
    }

    const code = updates.code ? updates.code.trim().toUpperCase() : existing.code;
    const name = updates.name ?? existing.name;
    const discountType = updates.discount_type ?? existing.discount_type;
    const discountValue = updates.discount_value !== undefined ? updates.discount_value : existing.discount_value;
    const maxDiscount = updates.max_discount !== undefined ? updates.max_discount : existing.max_discount;
    const minOrder = updates.minimum_order_value !== undefined ? updates.minimum_order_value : existing.minimum_order_value;
    const totalLimit = updates.total_usage_limit !== undefined ? updates.total_usage_limit : existing.total_usage_limit;
    const perUserLimit = updates.per_user_usage_limit !== undefined ? updates.per_user_usage_limit : existing.per_user_usage_limit;
    const dailyLimit = updates.per_user_daily_limit !== undefined ? updates.per_user_daily_limit : existing.per_user_daily_limit;
    const startAt = updates.start_at ?? existing.start_at;
    const endAt = updates.end_at ?? existing.end_at;
    const active = updates.active !== undefined ? (updates.active ? 1 : 0) : (existing.active ? 1 : 0);

    await this.db
      .prepare(`
        UPDATE coupons
        SET code = ?, name = ?, discount_type = ?, discount_value = ?, max_discount = ?,
            minimum_order_value = ?, total_usage_limit = ?, per_user_usage_limit = ?,
            per_user_daily_limit = ?, start_at = ?, end_at = ?, active = ?, updated_at = ?
        WHERE id = ?
      `)
      .bind(
        code,
        name,
        discountType,
        discountValue,
        maxDiscount,
        minOrder,
        totalLimit,
        perUserLimit,
        dailyLimit,
        startAt,
        endAt,
        active,
        now,
        id,
      )
      .run();

    const updated = await this.findCouponById(id);
    if (!updated) {
      throw new Error(`Coupon ${id} not found after update`);
    }
    return updated;
  }

  async deactivateCoupon(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare('UPDATE coupons SET active = 0, updated_at = ? WHERE id = ?')
      .bind(now, id)
      .run();
  }

  // ==========================================
  // Coupon Usage Tracking & Limits
  // ==========================================

  async getUsageCount(couponId: string): Promise<number> {
    const res = await this.db
      .prepare('SELECT COUNT(*) as count FROM coupon_usages WHERE coupon_id = ?')
      .bind(couponId)
      .first<{ count: number }>();
    return res?.count ?? 0;
  }

  async getUserUsageCount(couponId: string, userId: string): Promise<number> {
    const res = await this.db
      .prepare('SELECT COUNT(*) as count FROM coupon_usages WHERE coupon_id = ? AND user_id = ?')
      .bind(couponId, userId)
      .first<{ count: number }>();
    return res?.count ?? 0;
  }

  async getUserDailyUsageCount(couponId: string, userId: string, datePrefix: string): Promise<number> {
    // datePrefix e.g. "2026-10-02"
    const res = await this.db
      .prepare('SELECT COUNT(*) as count FROM coupon_usages WHERE coupon_id = ? AND user_id = ? AND used_at LIKE ?')
      .bind(couponId, userId, `${datePrefix}%`)
      .first<{ count: number }>();
    return res?.count ?? 0;
  }

  async findUsageByOrder(orderId: string): Promise<CouponUsage | null> {
    return this.db
      .prepare('SELECT * FROM coupon_usages WHERE order_id = ?')
      .bind(orderId)
      .first<CouponUsage>();
  }

  /**
   * Concurrency-safe atomic increment of coupon usage.
   * Fails cleanly if usage_limit is exceeded.
   */
  prepareCouponIncrementStatement(couponId: string, nowIso: string): D1PreparedStatementLike {
    return this.db
      .prepare(`
        UPDATE coupons
        SET usage_count = usage_count + 1,
            updated_at = ?
        WHERE id = ?
          AND active = 1
          AND (total_usage_limit IS NULL OR usage_count < total_usage_limit)
      `)
      .bind(nowIso, couponId);
  }

  prepareCouponUsageStatement(
    id: string,
    couponId: string,
    userId: string,
    orderId: string,
    discountAmount: number,
    nowIso: string,
  ): D1PreparedStatementLike {
    return this.db
      .prepare(`
        INSERT INTO coupon_usages (id, coupon_id, user_id, order_id, discount_amount, used_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(id, couponId, userId, orderId, discountAmount, nowIso);
  }

  /**
   * Concurrency-safe atomic increment of offer usage.
   * Fails cleanly if usage_limit is exceeded.
   */
  prepareOfferIncrementStatement(offerId: string, nowIso: string): D1PreparedStatementLike {
    return this.db
      .prepare(`
        UPDATE offers
        SET usage_count = usage_count + 1,
            updated_at = ?
        WHERE id = ?
          AND active = 1
          AND (usage_limit IS NULL OR usage_count < usage_limit)
      `)
      .bind(nowIso, offerId);
  }

  // ==========================================
  // Private / Targeted Coupons
  // ==========================================

  async assignPrivateCouponToUsers(input: {
    userIds: string[];
    couponCode: string;
    title: string;
    discountType: DiscountType;
    discountValue: number;
    minOrderValue?: number;
    maxDiscount?: number | null;
    branchId?: string;
    expiresAt?: string;
    campaignId?: string | null;
  }): Promise<{ createdCouponCount: number; assignedCount: number }> {
    const nowIso = new Date().toISOString();
    const expiryIso = input.expiresAt || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const normalizedCode = input.couponCode.trim().toUpperCase();

    // 1. Ensure the coupon exists in `coupons` table for the target branch (or all branches if branchId is omitted/ALL)
    let branchIds: string[] = [];
    if (input.branchId && input.branchId !== 'ALL') {
      branchIds = [input.branchId];
    } else {
      const branchesRes = await this.db.prepare('SELECT id FROM branches').all<{ id: string }>();
      branchIds = (branchesRes.results || []).map((b) => b.id);
      if (branchIds.length === 0) branchIds = ['branch-alpha'];
    }

    let createdCouponCount = 0;
    for (const bId of branchIds) {
      const existing = await this.findCouponByCode(bId, normalizedCode);
      if (!existing) {
        await this.createCoupon({
          branch_id: bId,
          code: normalizedCode,
          name: input.title || `Special Offer ${normalizedCode}`,
          discount_type: input.discountType,
          discount_value: input.discountValue,
          max_discount: input.maxDiscount ?? null,
          minimum_order_value: input.minOrderValue ?? 0,
          per_user_usage_limit: 1,
          start_at: nowIso,
          end_at: expiryIso,
          active: true,
        });
        createdCouponCount++;
      }
    }

    // 2. Insert record for each targeted user in user_private_coupons
    let assignedCount = 0;
    for (const uId of input.userIds) {
      const recordId = `upc_${crypto.randomUUID().replace(/-/g, '')}`;
      await this.db
        .prepare(`
          INSERT INTO user_private_coupons (
            id, user_id, coupon_code, title, discount_type, discount_value,
            min_order_value, max_discount, branch_id, expires_at, is_claimed, campaign_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
        `)
        .bind(
          recordId,
          uId,
          normalizedCode,
          input.title || `Special Offer ${normalizedCode}`,
          input.discountType,
          input.discountValue,
          input.minOrderValue ?? 0,
          input.maxDiscount ?? null,
          input.branchId && input.branchId !== 'ALL' ? input.branchId : null,
          expiryIso,
          input.campaignId ?? null,
          nowIso,
        )
        .run();
      assignedCount++;
    }

    return { createdCouponCount, assignedCount };
  }

  async getPrivateCouponsForUser(
    userId: string,
    branchId?: string,
  ): Promise<
    Array<{
      id: string;
      user_id: string;
      coupon_code: string;
      title: string;
      discount_type: DiscountType;
      discount_value: number;
      min_order_value: number;
      max_discount: number | null;
      branch_id: string | null;
      expires_at: string;
      is_claimed: number;
    }>
  > {
    const res = await this.db
      .prepare(`
        SELECT * FROM user_private_coupons
        WHERE user_id = ?
          AND is_claimed = 0
          AND datetime(expires_at) > datetime('now')
          AND (branch_id IS NULL OR branch_id = ? OR ? IS NULL)
        ORDER BY created_at DESC
      `)
      .bind(userId, branchId || null, branchId || null)
      .all<any>();

    return res.results || [];
  }

  async markPrivateCouponClaimed(userId: string, couponCode: string): Promise<void> {
    await this.db
      .prepare(`
        UPDATE user_private_coupons
        SET is_claimed = 1
        WHERE user_id = ? AND UPPER(coupon_code) = UPPER(?)
      `)
      .bind(userId, couponCode.trim())
      .run();
  }
}

