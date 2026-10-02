import { Offer, Coupon } from '../../../shared/types/entities.types';
import { PromotionRepository, CreateOfferInput, UpdateOfferInput, CreateCouponInput, UpdateCouponInput } from '../../../database/repositories/promotion.repository';
import { AuditRepository } from '../../../database/repositories/audit.repository';
import { D1DatabaseLike } from '../../../database/types';
import { AuditAction } from '../../../shared/enums/audit.enum';
import { NotFoundError, ForbiddenError } from '../../errors/app-error';

export interface ValidateCouponResult {
  isValid: boolean;
  coupon?: Coupon;
  discount: number;
  reason?: string;
}

export interface ValidateOfferResult {
  isValid: boolean;
  offer?: Offer;
  discount: number;
  reason?: string;
}

export interface IPromotionsService {
  // Offers
  listOffers(branchId: string, onlyActive?: boolean): Promise<Offer[]>;
  getActiveOffers(branchId: string): Promise<Offer[]>;
  getOfferById(branchId: string, offerId: string): Promise<Offer | null>;
  createOffer(branchId: string, actorUserId: string, input: Omit<CreateOfferInput, 'branch_id'>): Promise<Offer>;
  updateOffer(branchId: string, offerId: string, actorUserId: string, input: UpdateOfferInput): Promise<Offer>;
  deactivateOffer(branchId: string, offerId: string, actorUserId: string): Promise<void>;
  validateOffer(branchId: string, offerId: string, subtotal: number, now?: Date): Promise<ValidateOfferResult>;

  // Coupons
  listCoupons(branchId: string, onlyActive?: boolean): Promise<Coupon[]>;
  getCouponByCode(branchId: string, code: string): Promise<Coupon | null>;
  getCouponById(branchId: string, couponId: string): Promise<Coupon | null>;
  createCoupon(branchId: string, actorUserId: string, input: Omit<CreateCouponInput, 'branch_id'>): Promise<Coupon>;
  updateCoupon(branchId: string, couponId: string, actorUserId: string, input: UpdateCouponInput): Promise<Coupon>;
  deactivateCoupon(branchId: string, couponId: string, actorUserId: string): Promise<void>;
  validateCoupon(params: {
    branchId: string;
    code: string;
    subtotal: number;
    userId?: string;
    now?: Date;
  }): Promise<ValidateCouponResult>;
}

export const PROMOTIONS_SERVICE_TOKEN = 'IPromotionsService';

export class PromotionsService implements IPromotionsService {
  private promotionRepo: PromotionRepository;

  constructor(
    repoOrDb: PromotionRepository | D1DatabaseLike,
    private auditRepo?: AuditRepository,
  ) {
    if ('findCouponByCode' in repoOrDb) {
      this.promotionRepo = repoOrDb as PromotionRepository;
    } else {
      this.promotionRepo = new PromotionRepository(repoOrDb as D1DatabaseLike);
    }
  }

  // ==========================================
  // Offers
  // ==========================================

  async listOffers(branchId: string, onlyActive: boolean = true): Promise<Offer[]> {
    return this.promotionRepo.listOffersByBranch(branchId, onlyActive);
  }

  async getActiveOffers(branchId: string): Promise<Offer[]> {
    return this.promotionRepo.listOffersByBranch(branchId, true);
  }

  async getOfferById(branchId: string, offerId: string): Promise<Offer | null> {
    const offer = await this.promotionRepo.findOfferById(offerId);
    if (!offer) return null;
    if (offer.branch_id !== branchId) {
      throw new ForbiddenError('Offer belongs to a different branch');
    }
    return offer;
  }

  async createOffer(
    branchId: string,
    actorUserId: string,
    input: Omit<CreateOfferInput, 'branch_id'>,
  ): Promise<Offer> {
    const offer = await this.promotionRepo.createOffer({
      ...input,
      branch_id: branchId,
    });

    await this.auditRepo?.log({
      branch_id: branchId,
      actor_user_id: actorUserId,
      action: AuditAction.OFFER_CREATED,
      entity_type: 'offer',
      entity_id: offer.id,
      metadata: { name: offer.name, type: offer.offer_type },
    });

    return offer;
  }

  async updateOffer(
    branchId: string,
    offerId: string,
    actorUserId: string,
    input: UpdateOfferInput,
  ): Promise<Offer> {
    const existing = await this.promotionRepo.findOfferById(offerId);
    if (!existing) throw new NotFoundError(`Offer ${offerId} not found`);
    if (existing.branch_id !== branchId) {
      throw new ForbiddenError('Cannot update offer of another branch');
    }

    const updated = await this.promotionRepo.updateOffer(offerId, input);

    await this.auditRepo?.log({
      branch_id: branchId,
      actor_user_id: actorUserId,
      action: AuditAction.OFFER_UPDATED,
      entity_type: 'offer',
      entity_id: offerId,
      metadata: { updates: input },
    });

    return updated;
  }

  async deactivateOffer(branchId: string, offerId: string, actorUserId: string): Promise<void> {
    const existing = await this.promotionRepo.findOfferById(offerId);
    if (!existing) throw new NotFoundError(`Offer ${offerId} not found`);
    if (existing.branch_id !== branchId) {
      throw new ForbiddenError('Cannot deactivate offer of another branch');
    }

    await this.promotionRepo.deactivateOffer(offerId);

    await this.auditRepo?.log({
      branch_id: branchId,
      actor_user_id: actorUserId,
      action: AuditAction.OFFER_DEACTIVATED,
      entity_type: 'offer',
      entity_id: offerId,
      metadata: {},
    });
  }

  async validateOffer(
    branchId: string,
    offerId: string,
    subtotal: number,
    now: Date = new Date(),
  ): Promise<ValidateOfferResult> {
    const offer = await this.promotionRepo.findOfferById(offerId);
    if (!offer) {
      return { isValid: false, discount: 0, reason: 'Offer not found' };
    }
    if (offer.branch_id !== branchId) {
      return { isValid: false, discount: 0, reason: 'Offer does not apply to this branch' };
    }
    if (!offer.active) {
      return { isValid: false, discount: 0, reason: 'Offer is inactive' };
    }

    const nowTime = now.getTime();
    if (nowTime < new Date(offer.start_at).getTime()) {
      return { isValid: false, discount: 0, reason: 'Offer is not yet active' };
    }
    if (offer.end_at && nowTime > new Date(offer.end_at).getTime()) {
      return { isValid: false, discount: 0, reason: 'Offer has expired' };
    }
    if (offer.usage_limit != null && offer.usage_count >= offer.usage_limit) {
      return { isValid: false, discount: 0, reason: 'Offer usage limit reached' };
    }

    let discount = 0;
    try {
      const config = JSON.parse(offer.configuration_json || '{}');
      if (config.discount_type === 'PERCENTAGE' && typeof config.discount_value === 'number') {
        discount = (subtotal * config.discount_value) / 100;
        if (typeof config.max_discount === 'number' && config.max_discount > 0) {
          discount = Math.min(discount, config.max_discount);
        }
      } else if (config.discount_type === 'FIXED' && typeof config.discount_value === 'number') {
        discount = Math.min(config.discount_value, subtotal);
      }
    } catch {
      discount = 0;
    }

    discount = Math.round(discount * 100) / 100;
    return { isValid: true, offer, discount };
  }

  // ==========================================
  // Coupons
  // ==========================================

  async listCoupons(branchId: string, onlyActive: boolean = true): Promise<Coupon[]> {
    return this.promotionRepo.listCouponsByBranch(branchId, onlyActive);
  }

  async getCouponByCode(branchId: string, code: string): Promise<Coupon | null> {
    return this.promotionRepo.findCouponByCode(branchId, code);
  }

  async getCouponById(branchId: string, couponId: string): Promise<Coupon | null> {
    const coupon = await this.promotionRepo.findCouponById(couponId);
    if (!coupon) return null;
    if (coupon.branch_id !== branchId) {
      throw new ForbiddenError('Coupon belongs to a different branch');
    }
    return coupon;
  }

  async createCoupon(
    branchId: string,
    actorUserId: string,
    input: Omit<CreateCouponInput, 'branch_id'>,
  ): Promise<Coupon> {
    const coupon = await this.promotionRepo.createCoupon({
      ...input,
      branch_id: branchId,
    });

    await this.auditRepo?.log({
      branch_id: branchId,
      actor_user_id: actorUserId,
      action: AuditAction.COUPON_CREATED,
      entity_type: 'coupon',
      entity_id: coupon.id,
      metadata: { code: coupon.code, discount_type: coupon.discount_type, discount_value: coupon.discount_value },
    });

    return coupon;
  }

  async updateCoupon(
    branchId: string,
    couponId: string,
    actorUserId: string,
    input: UpdateCouponInput,
  ): Promise<Coupon> {
    const existing = await this.promotionRepo.findCouponById(couponId);
    if (!existing) throw new NotFoundError(`Coupon ${couponId} not found`);
    if (existing.branch_id !== branchId) {
      throw new ForbiddenError('Cannot update coupon of another branch');
    }

    const updated = await this.promotionRepo.updateCoupon(couponId, input);

    await this.auditRepo?.log({
      branch_id: branchId,
      actor_user_id: actorUserId,
      action: AuditAction.COUPON_UPDATED,
      entity_type: 'coupon',
      entity_id: couponId,
      metadata: { updates: input },
    });

    return updated;
  }

  async deactivateCoupon(branchId: string, couponId: string, actorUserId: string): Promise<void> {
    const existing = await this.promotionRepo.findCouponById(couponId);
    if (!existing) throw new NotFoundError(`Coupon ${couponId} not found`);
    if (existing.branch_id !== branchId) {
      throw new ForbiddenError('Cannot deactivate coupon of another branch');
    }

    await this.promotionRepo.deactivateCoupon(couponId);

    await this.auditRepo?.log({
      branch_id: branchId,
      actor_user_id: actorUserId,
      action: AuditAction.COUPON_DEACTIVATED,
      entity_type: 'coupon',
      entity_id: couponId,
      metadata: {},
    });
  }

  async validateCoupon(params: {
    branchId: string;
    code: string;
    subtotal: number;
    userId?: string;
    now?: Date;
  }): Promise<ValidateCouponResult> {
    const { branchId, code, subtotal, userId } = params;
    const now = params.now ?? new Date();

    if (!code || !code.trim()) {
      return { isValid: false, discount: 0, reason: 'Coupon code is required' };
    }

    const coupon = await this.promotionRepo.findCouponByCode(branchId, code);
    if (!coupon || (coupon.branch_id && coupon.branch_id !== branchId)) {
      return { isValid: false, discount: 0, reason: `Coupon code "${code}" is not valid for this branch` };
    }

    if (!coupon.active) {
      return { isValid: false, discount: 0, reason: 'This coupon is no longer active' };
    }

    const nowTime = now.getTime();
    if (nowTime < new Date(coupon.start_at).getTime()) {
      return { isValid: false, discount: 0, reason: 'This coupon is not yet valid' };
    }
    if (new Date(coupon.end_at).getTime() < nowTime) {
      return { isValid: false, discount: 0, reason: 'This coupon has expired' };
    }

    if (subtotal < coupon.minimum_order_value) {
      return {
        isValid: false,
        discount: 0,
        reason: `Order subtotal of ₹${subtotal.toFixed(2)} does not meet minimum order requirement of ₹${coupon.minimum_order_value.toFixed(2)}`,
      };
    }

    if (coupon.total_usage_limit !== null && coupon.total_usage_limit !== undefined) {
      if (coupon.usage_count >= coupon.total_usage_limit) {
        return { isValid: false, discount: 0, reason: 'Total usage limit for this coupon has been reached' };
      }
    }

    if (userId && coupon.per_user_usage_limit !== null && coupon.per_user_usage_limit !== undefined) {
      const userCount = await this.promotionRepo.getUserUsageCount(coupon.id, userId);
      if (userCount >= coupon.per_user_usage_limit) {
        return { isValid: false, discount: 0, reason: 'You have reached the maximum allowed usages for this coupon' };
      }
    }

    if (userId && coupon.per_user_daily_limit !== null && coupon.per_user_daily_limit !== undefined) {
      const todayPrefix = now.toISOString().slice(0, 10);
      const dailyCount = await this.promotionRepo.getUserDailyUsageCount(coupon.id, userId, todayPrefix);
      if (dailyCount >= coupon.per_user_daily_limit) {
        return { isValid: false, discount: 0, reason: 'You have reached your daily limit for this coupon' };
      }
    }

    // Authoritative calculation of discount
    let calculatedDiscount: number;
    if (coupon.discount_type === 'PERCENTAGE') {
      const percentageDiscount = (subtotal * coupon.discount_value) / 100;
      if (coupon.max_discount !== null && coupon.max_discount !== undefined && coupon.max_discount > 0) {
        calculatedDiscount = Math.min(percentageDiscount, coupon.max_discount);
      } else {
        calculatedDiscount = percentageDiscount;
      }
    } else {
      calculatedDiscount = Math.min(coupon.discount_value, subtotal);
    }

    const discount = Math.round(calculatedDiscount * 100) / 100;

    return {
      isValid: true,
      coupon,
      discount,
    };
  }

  getPromotionRepo(): PromotionRepository {
    return this.promotionRepo;
  }
}
