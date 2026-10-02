'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Offer, Coupon } from '../../../shared/types/entities.types';
import { DiscountType, OfferType } from '../../../shared/enums/promotions.enum';
import { apiClient } from '../../services/api-client';

interface OperatorPromotionsViewProps {
  branchId: string;
}

export const OperatorPromotionsView: React.FC<OperatorPromotionsViewProps> = ({ branchId }) => {
  const [activeTab, setActiveTab] = useState<'offers' | 'coupons'>('coupons');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [offers, setOffers] = useState<Offer[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);

  // Coupon modal
  const [showCouponModal, setShowCouponModal] = useState<boolean>(false);
  const [couponCode, setCouponCode] = useState<string>('');
  const [couponName, setCouponName] = useState<string>('');
  const [couponDiscountType, setCouponDiscountType] = useState<DiscountType>(DiscountType.PERCENTAGE);
  const [couponDiscountValue, setCouponDiscountValue] = useState<string>('');
  const [couponMaxDiscount, setCouponMaxDiscount] = useState<string>('');
  const [couponMinOrder, setCouponMinOrder] = useState<string>('0');
  const [couponTotalLimit, setCouponTotalLimit] = useState<string>('');
  const [couponUserLimit, setCouponUserLimit] = useState<string>('');
  const [couponDailyLimit, setCouponDailyLimit] = useState<string>('');
  const [couponStartAt, setCouponStartAt] = useState<string>(new Date().toISOString().slice(0, 10));
  const [couponEndAt, setCouponEndAt] = useState<string>(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
  const [modalSubmitting, setModalSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Offer modal
  const [showOfferModal, setShowOfferModal] = useState<boolean>(false);
  const [offerName, setOfferName] = useState<string>('');
  const [offerType, setOfferType] = useState<OfferType>(OfferType.FLAT);
  const [offerDescription, setOfferDescription] = useState<string>('');
  const [offerConfigVal, setOfferConfigVal] = useState<string>('10');
  const [offerConfigType, setOfferConfigType] = useState<'PERCENTAGE' | 'FIXED'>('PERCENTAGE');

  const fetchPromotions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [offersRes, couponsRes] = await Promise.all([
        apiClient.request<Offer[]>(`/api/v1/branches/${branchId}/promotions/offers`, {
          authenticated: true,
          requireSession: true,
        }),
        apiClient.request<Coupon[]>(`/api/v1/branches/${branchId}/promotions/coupons`, {
          authenticated: true,
          requireSession: true,
        }),
      ]);

      if (offersRes.success) setOffers(offersRes.data);
      if (couponsRes.success) setCoupons(couponsRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading promotions');
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    fetchPromotions();
  }, [fetchPromotions]);

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCode.trim() || !couponName.trim()) return;

    setModalSubmitting(true);
    setModalError(null);

    try {
      const body = {
        code: couponCode.trim().toUpperCase(),
        name: couponName.trim(),
        discount_type: couponDiscountType,
        discount_value: parseFloat(couponDiscountValue) || 0,
        max_discount: couponMaxDiscount ? parseFloat(couponMaxDiscount) : null,
        minimum_order_value: parseFloat(couponMinOrder) || 0,
        total_usage_limit: couponTotalLimit ? parseInt(couponTotalLimit, 10) : null,
        per_user_usage_limit: couponUserLimit ? parseInt(couponUserLimit, 10) : null,
        per_user_daily_limit: couponDailyLimit ? parseInt(couponDailyLimit, 10) : null,
        start_at: new Date(couponStartAt).toISOString(),
        end_at: new Date(couponEndAt).toISOString(),
        active: true,
      };

      const res = await apiClient.request(`/api/v1/branches/${branchId}/promotions/coupons`, {
        method: 'POST',
        authenticated: true,
        requireSession: true,
        body: JSON.stringify(body),
      });

      if (!res.success) {
        throw new Error(res.error.message || 'Failed to create coupon');
      }

      setShowCouponModal(false);
      setCouponCode('');
      setCouponName('');
      setCouponDiscountValue('');
      await fetchPromotions();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to create coupon');
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleDeactivateCoupon = async (couponId: string) => {
    if (!confirm('Are you sure you want to deactivate this coupon?')) return;
    try {
      await apiClient.request(`/api/v1/branches/${branchId}/promotions/coupons/${couponId}`, {
        method: 'DELETE',
        authenticated: true,
        requireSession: true,
      });
      await fetchPromotions();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to deactivate coupon');
    }
  };

  const handleCreateOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offerName.trim()) return;

    setModalSubmitting(true);
    setModalError(null);

    try {
      const configJson = JSON.stringify({
        discount_type: offerConfigType,
        discount_value: parseFloat(offerConfigVal) || 0,
      });

      const body = {
        name: offerName.trim(),
        description: offerDescription.trim() || undefined,
        offer_type: offerType,
        configuration_json: configJson,
        start_at: new Date().toISOString(),
        active: true,
      };

      const res = await apiClient.request(`/api/v1/branches/${branchId}/promotions/offers`, {
        method: 'POST',
        authenticated: true,
        requireSession: true,
        body: JSON.stringify(body),
      });

      if (!res.success) {
        throw new Error(res.error.message || 'Failed to create offer');
      }

      setShowOfferModal(false);
      setOfferName('');
      setOfferDescription('');
      await fetchPromotions();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to create offer');
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleDeactivateOffer = async (offerId: string) => {
    if (!confirm('Are you sure you want to deactivate this offer?')) return;
    try {
      await apiClient.request(`/api/v1/branches/${branchId}/promotions/offers/${offerId}`, {
        method: 'DELETE',
        authenticated: true,
        requireSession: true,
      });
      await fetchPromotions();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to deactivate offer');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveTab('coupons')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${
              activeTab === 'coupons'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            Branch Coupons ({coupons.length})
          </button>
          <button
            onClick={() => setActiveTab('offers')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${
              activeTab === 'offers'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            Branch Offers ({offers.length})
          </button>
        </div>

        <div className="flex items-center space-x-3">
          {activeTab === 'coupons' ? (
            <button
              onClick={() => {
                setShowCouponModal(true);
                setModalError(null);
              }}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition shadow"
            >
              + Create Coupon
            </button>
          ) : (
            <button
              onClick={() => {
                setShowOfferModal(true);
                setModalError(null);
              }}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition shadow"
            >
              + Create Offer
            </button>
          )}

          <button
            onClick={fetchPromotions}
            disabled={loading}
            className="text-xs text-slate-400 hover:text-white"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-950/40 border border-red-800 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Coupons View */}
      {activeTab === 'coupons' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/80 text-xs uppercase text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-6 py-3">Code</th>
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Discount</th>
                <th className="px-6 py-3">Min Order</th>
                <th className="px-6 py-3">Usage Count / Limit</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {coupons.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    No coupons created for this branch yet.
                  </td>
                </tr>
              ) : (
                coupons.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/30 transition">
                    <td className="px-6 py-4 font-mono font-bold text-amber-400">
                      <span className="px-2 py-0.5 rounded bg-amber-950/80 border border-amber-800/80">
                        {c.code}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-semibold text-white">{c.name}</td>
                    <td className="px-6 py-4">
                      {c.discount_type === 'PERCENTAGE' ? `${c.discount_value}%` : `₹${c.discount_value}`}
                      {c.max_discount && ` (Max ₹${c.max_discount})`}
                    </td>
                    <td className="px-6 py-4 text-slate-400">₹{c.minimum_order_value}</td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-300">
                      {c.usage_count} / {c.total_usage_limit ?? '∞'}
                    </td>
                    <td className="px-6 py-4">
                      {c.active ? (
                        <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300">
                          ACTIVE
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs font-semibold rounded bg-slate-800 text-slate-400">
                          INACTIVE
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {c.active && (
                        <button
                          onClick={() => handleDeactivateCoupon(c.id)}
                          className="px-2.5 py-1 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 text-xs font-semibold rounded transition"
                        >
                          Deactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Offers View */}
      {activeTab === 'offers' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/80 text-xs uppercase text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-6 py-3">Offer Name</th>
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3">Configuration</th>
                <th className="px-6 py-3">Usage Count / Limit</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {offers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    No offers configured for this branch yet.
                  </td>
                </tr>
              ) : (
                offers.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-800/30 transition">
                    <td className="px-6 py-4 font-semibold text-white">
                      <div>{o.name}</div>
                      {o.description && <div className="text-xs text-slate-400 font-normal">{o.description}</div>}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-amber-300">{o.offer_type}</td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-400 max-w-xs truncate">
                      {o.configuration_json}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-300">
                      {o.usage_count} / {o.usage_limit ?? '∞'}
                    </td>
                    <td className="px-6 py-4">
                      {o.active ? (
                        <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300">
                          ACTIVE
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs font-semibold rounded bg-slate-800 text-slate-400">
                          INACTIVE
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {o.active && (
                        <button
                          onClick={() => handleDeactivateOffer(o.id)}
                          className="px-2.5 py-1 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 text-xs font-semibold rounded transition"
                        >
                          Deactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Coupon Modal */}
      {showCouponModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-white">Create Branch Coupon</h3>

            {modalError && (
              <div className="p-3 bg-red-950/50 border border-red-800 rounded-lg text-xs text-red-300">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateCoupon} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Coupon Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. MELT20"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono text-sm uppercase focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Coupon Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 20% Weekend Promo"
                    value={couponName}
                    onChange={(e) => setCouponName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Discount Type</label>
                  <select
                    value={couponDiscountType}
                    onChange={(e) => setCouponDiscountType(e.target.value as DiscountType)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                  >
                    <option value={DiscountType.PERCENTAGE}>Percentage (%)</option>
                    <option value={DiscountType.FIXED}>Fixed (₹)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Discount Value *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder={couponDiscountType === DiscountType.PERCENTAGE ? 'e.g. 20' : 'e.g. 50'}
                    value={couponDiscountValue}
                    onChange={(e) => setCouponDiscountValue(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Max Cap (₹)</label>
                  <input
                    type="number"
                    placeholder="Optional"
                    value={couponMaxDiscount}
                    onChange={(e) => setCouponMaxDiscount(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Min Order (₹)</label>
                  <input
                    type="number"
                    value={couponMinOrder}
                    onChange={(e) => setCouponMinOrder(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Total Limit</label>
                  <input
                    type="number"
                    placeholder="Unlimited"
                    value={couponTotalLimit}
                    onChange={(e) => setCouponTotalLimit(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Per User Limit</label>
                  <input
                    type="number"
                    placeholder="Unlimited"
                    value={couponUserLimit}
                    onChange={(e) => setCouponUserLimit(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Daily Limit</label>
                  <input
                    type="number"
                    placeholder="Unlimited"
                    value={couponDailyLimit}
                    onChange={(e) => setCouponDailyLimit(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={couponStartAt}
                    onChange={(e) => setCouponStartAt(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">End Date</label>
                  <input
                    type="date"
                    value={couponEndAt}
                    onChange={(e) => setCouponEndAt(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCouponModal(false)}
                  disabled={modalSubmitting}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-bold rounded-lg transition"
                >
                  {modalSubmitting ? 'Creating...' : 'Create Coupon'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Offer Modal */}
      {showOfferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white">Create Branch Offer</h3>

            {modalError && (
              <div className="p-3 bg-red-950/50 border border-red-800 rounded-lg text-xs text-red-300">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateOffer} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Offer Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Summer Scoop Deal"
                  value={offerName}
                  onChange={(e) => setOfferName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Offer Type</label>
                <select
                  value={offerType}
                  onChange={(e) => setOfferType(e.target.value as OfferType)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                >
                  <option value={OfferType.FLAT}>Flat Discount</option>
                  <option value={OfferType.COMBO}>Combo Deal</option>
                  <option value={OfferType.BUY_X_GET_Y}>Buy X Get Y</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Discount Type</label>
                  <select
                    value={offerConfigType}
                    onChange={(e) => setOfferConfigType(e.target.value as 'PERCENTAGE' | 'FIXED')}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                  >
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FIXED">Fixed (₹)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Discount Value</label>
                  <input
                    type="number"
                    value={offerConfigVal}
                    onChange={(e) => setOfferConfigVal(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Description</label>
                <input
                  type="text"
                  placeholder="Optional details"
                  value={offerDescription}
                  onChange={(e) => setOfferDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOfferModal(false)}
                  disabled={modalSubmitting}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-bold rounded-lg transition"
                >
                  {modalSubmitting ? 'Creating...' : 'Create Offer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
