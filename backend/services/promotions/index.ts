import { Offer, Coupon } from '../../../shared/types/entities.types';
import { D1DatabaseLike } from '../../../database/types';

export interface IPromotionsService {
  getActiveOffers(branchId: string): Promise<Offer[]>;
  getCouponByCode(branchId: string, code: string): Promise<Coupon | null>;
}

export const PROMOTIONS_SERVICE_TOKEN = 'IPromotionsService';

export class PromotionsService implements IPromotionsService {
  constructor(private db: D1DatabaseLike) {}

  async getActiveOffers(branchId: string): Promise<Offer[]> {
    const res = await this.db
      .prepare('SELECT * FROM offers WHERE branch_id = ? AND active = 1 ORDER BY created_at DESC')
      .bind(branchId)
      .all<Offer>();
    return res.results;
  }

  async getCouponByCode(branchId: string, code: string): Promise<Coupon | null> {
    return this.db
      .prepare('SELECT * FROM coupons WHERE branch_id = ? AND code = ? AND active = 1')
      .bind(branchId, code)
      .first<Coupon>();
  }
}
