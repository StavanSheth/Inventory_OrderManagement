import { Offer, Coupon } from '../../../shared/types/entities.types';

export interface IPromotionsService {
  getActiveOffers(branchId: string): Promise<Offer[]>;
  getCouponByCode(branchId: string, code: string): Promise<Coupon | null>;
}

export const PROMOTIONS_SERVICE_TOKEN = 'IPromotionsService';
