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
  const [editingCouponId, setEditingCouponId] = useState<string | null>(null);
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
  const [editingOfferId, setEditingOfferId] = useState<string | null>(null);
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

  const handleOpenCreateCoupon = () => {
    setEditingCouponId(null);
    setCouponCode('');
    setCouponName('');
    setCouponDiscountType(DiscountType.PERCENTAGE);
    setCouponDiscountValue('');
    setCouponMaxDiscount('');
    setCouponMinOrder('0');
    setCouponTotalLimit('');
    setCouponUserLimit('');
    setCouponDailyLimit('');
    setCouponStartAt(new Date().toISOString().slice(0, 10));
    setCouponEndAt(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    setModalError(null);
    setShowCouponModal(true);
  };

  const handleOpenEditCoupon = (c: Coupon) => {
    setEditingCouponId(c.id);
    setCouponCode(c.code);
    setCouponName(c.name);
    setCouponDiscountType(c.discount_type as DiscountType);
    setCouponDiscountValue(c.discount_value.toString());
    setCouponMaxDiscount(c.max_discount != null ? c.max_discount.toString() : '');
    setCouponMinOrder(c.minimum_order_value ? c.minimum_order_value.toString() : '0');
    setCouponTotalLimit(c.total_usage_limit != null ? c.total_usage_limit.toString() : '');
    setCouponUserLimit(c.per_user_usage_limit != null ? c.per_user_usage_limit.toString() : '');
    setCouponDailyLimit(c.per_user_daily_limit != null ? c.per_user_daily_limit.toString() : '');
    setCouponStartAt(c.start_at ? c.start_at.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setCouponEndAt(c.end_at ? c.end_at.slice(0, 10) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    setModalError(null);
    setShowCouponModal(true);
  };

  const handleSaveCoupon = async (e: React.FormEvent) => {
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

      const endpoint = editingCouponId
        ? `/api/v1/branches/${branchId}/promotions/coupons/${editingCouponId}`
        : `/api/v1/branches/${branchId}/promotions/coupons`;
      const method = editingCouponId ? 'PATCH' : 'POST';

      const res = await apiClient.request(endpoint, {
        method,
        authenticated: true,
        requireSession: true,
        body: JSON.stringify(body),
      });

      if (!res.success) {
        throw new Error(res.error.message || 'Failed to save coupon');
      }

      setShowCouponModal(false);
      setEditingCouponId(null);
      await fetchPromotions();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to save coupon');
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleToggleCouponActive = async (c: Coupon) => {
    try {
      if (c.active) {
        if (!confirm('Are you sure you want to deactivate this coupon?')) return;
        await apiClient.request(`/api/v1/branches/${branchId}/promotions/coupons/${c.id}`, {
          method: 'DELETE',
          authenticated: true,
          requireSession: true,
        });
      } else {
        await apiClient.request(`/api/v1/branches/${branchId}/promotions/coupons/${c.id}`, {
          method: 'PATCH',
          authenticated: true,
          requireSession: true,
          body: JSON.stringify({ active: true }),
        });
      }
      await fetchPromotions();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update coupon status');
    }
  };

  const handleOpenCreateOffer = () => {
    setEditingOfferId(null);
    setOfferName('');
    setOfferType(OfferType.FLAT);
    setOfferDescription('');
    setOfferConfigVal('10');
    setOfferConfigType('PERCENTAGE');
    setModalError(null);
    setShowOfferModal(true);
  };

  const handleOpenEditOffer = (o: Offer) => {
    setEditingOfferId(o.id);
    setOfferName(o.name);
    setOfferType(o.offer_type as OfferType);
    setOfferDescription(o.description ?? '');
    try {
      const cfg = JSON.parse(o.configuration_json || '{}');
      setOfferConfigVal(cfg.discount_value ? cfg.discount_value.toString() : '10');
      setOfferConfigType(cfg.discount_type === 'FIXED' ? 'FIXED' : 'PERCENTAGE');
    } catch {
      setOfferConfigVal('10');
      setOfferConfigType('PERCENTAGE');
    }
    setModalError(null);
    setShowOfferModal(true);
  };

  const handleSaveOffer = async (e: React.FormEvent) => {
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

      const endpoint = editingOfferId
        ? `/api/v1/branches/${branchId}/promotions/offers/${editingOfferId}`
        : `/api/v1/branches/${branchId}/promotions/offers`;
      const method = editingOfferId ? 'PATCH' : 'POST';

      const res = await apiClient.request(endpoint, {
        method,
        authenticated: true,
        requireSession: true,
        body: JSON.stringify(body),
      });

      if (!res.success) {
        throw new Error(res.error.message || 'Failed to save offer');
      }

      setShowOfferModal(false);
      setEditingOfferId(null);
      await fetchPromotions();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to save offer');
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleToggleOfferActive = async (o: Offer) => {
    try {
      if (o.active) {
        if (!confirm('Are you sure you want to deactivate this offer?')) return;
        await apiClient.request(`/api/v1/branches/${branchId}/promotions/offers/${o.id}`, {
          method: 'DELETE',
          authenticated: true,
          requireSession: true,
        });
      } else {
        await apiClient.request(`/api/v1/branches/${branchId}/promotions/offers/${o.id}`, {
          method: 'PATCH',
          authenticated: true,
          requireSession: true,
          body: JSON.stringify({ active: true }),
        });
      }
      await fetchPromotions();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update offer status');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f4d3dd] pb-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 flex-nowrap">
          <button
            onClick={() => setActiveTab('coupons')}
            className={`px-4 py-2 text-xs md:text-sm font-bold rounded-full transition ${
              activeTab === 'coupons'
                ? 'bg-[#d61c5d] text-white shadow-[0_3px_0_#a3134a]'
                : 'bg-white text-[#6f5569] border border-[#f4d3dd] hover:bg-[#fff1f4] hover:text-[#2b1233]'
            }`}
          >
            Branch Coupons ({coupons.length})
          </button>
          <button
            onClick={() => setActiveTab('offers')}
            className={`px-4 py-2 text-xs md:text-sm font-bold rounded-full transition ${
              activeTab === 'offers'
                ? 'bg-[#d61c5d] text-white shadow-[0_3px_0_#a3134a]'
                : 'bg-white text-[#6f5569] border border-[#f4d3dd] hover:bg-[#fff1f4] hover:text-[#2b1233]'
            }`}
          >
            Branch Offers ({offers.length})
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          {activeTab === 'coupons' ? (
            <button
              onClick={handleOpenCreateCoupon}
              className="px-4 py-2 bg-[#d61c5d] hover:bg-[#b8144e] active:translate-y-0.5 text-white font-bold text-xs rounded-full transition shadow-[0_3px_0_#a3134a]"
            >
              + Create Coupon
            </button>
          ) : (
            <button
              onClick={handleOpenCreateOffer}
              className="px-4 py-2 bg-[#d61c5d] hover:bg-[#b8144e] active:translate-y-0.5 text-white font-bold text-xs rounded-full transition shadow-[0_3px_0_#a3134a]"
            >
              + Create Offer
            </button>
          )}

          <button
            onClick={fetchPromotions}
            disabled={loading}
            className="px-3.5 py-2 bg-white border border-[#f4d3dd] text-[#6f5569] hover:text-[#2b1233] hover:bg-[#fff1f4] rounded-full text-xs font-semibold transition"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-sm">
          {error}
        </div>
      )}

      {/* Coupons View */}
      {activeTab === 'coupons' && (
        <div className="bg-white border border-[#f4d3dd] rounded-3xl overflow-hidden shadow-[0_10px_30px_-15px_rgba(120,20,60,0.1)]">
          <table className="w-full text-left text-sm text-[#2b1233]">
            <thead className="bg-[#fff1f4] text-xs uppercase font-extrabold text-[#6f5569] border-b border-[#f4d3dd]">
              <tr>
                <th className="px-6 py-3.5">Code</th>
                <th className="px-6 py-3.5">Name</th>
                <th className="px-6 py-3.5">Discount</th>
                <th className="px-6 py-3.5">Min Order</th>
                <th className="px-6 py-3.5">Usage / Limit</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f4d3dd]/60">
              {coupons.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-[#6f5569]">
                    No coupons created for this branch yet.
                  </td>
                </tr>
              ) : (
                coupons.map((c) => (
                  <tr key={c.id} className="hover:bg-[#fff1f4]/40 transition">
                    <td className="px-6 py-4 font-mono font-bold text-[#d61c5d]">
                      <span className="px-2.5 py-1 rounded-full bg-[#ffc2d4]/40 border border-[#f4d3dd]">
                        {c.code}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-semibold text-[#2b1233]">{c.name}</td>
                    <td className="px-6 py-4 text-[#6f5569]">
                      <span className="font-bold text-[#2b1233]">
                        {c.discount_type === 'PERCENTAGE' ? `${c.discount_value}%` : `₹${c.discount_value}`}
                      </span>
                      {c.max_discount && ` (Max ₹${c.max_discount})`}
                    </td>
                    <td className="px-6 py-4 text-[#6f5569]">₹{c.minimum_order_value}</td>
                    <td className="px-6 py-4 font-mono text-xs text-[#6f5569]">
                      {c.usage_count} / {c.total_usage_limit ?? '∞'}
                    </td>
                    <td className="px-6 py-4">
                      {c.active ? (
                        <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-[#bfe3a6] text-[#2b1233]">
                          ACTIVE
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-[#f4d3dd]/50 text-[#6f5569]">
                          INACTIVE
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right space-x-1.5">
                      <button
                        onClick={() => handleOpenEditCoupon(c)}
                        className="px-3 py-1 bg-white hover:bg-[#fff1f4] border border-[#f4d3dd] text-[#2b1233] text-xs font-bold rounded-full transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleCouponActive(c)}
                        className={`px-3 py-1 bg-white border text-xs font-bold rounded-full transition ${
                          c.active
                            ? 'hover:bg-rose-50 border-rose-200 text-rose-600'
                            : 'hover:bg-emerald-50 border-emerald-200 text-emerald-600'
                        }`}
                      >
                        {c.active ? 'Deactivate' : 'Activate'}
                      </button>
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
        <div className="bg-white border border-[#f4d3dd] rounded-3xl overflow-hidden shadow-[0_10px_30px_-15px_rgba(120,20,60,0.1)]">
          <table className="w-full text-left text-sm text-[#2b1233]">
            <thead className="bg-[#fff1f4] text-xs uppercase font-extrabold text-[#6f5569] border-b border-[#f4d3dd]">
              <tr>
                <th className="px-6 py-3.5">Offer Name</th>
                <th className="px-6 py-3.5">Type</th>
                <th className="px-6 py-3.5">Configuration</th>
                <th className="px-6 py-3.5">Usage / Limit</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f4d3dd]/60">
              {offers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-[#6f5569]">
                    No offers configured for this branch yet.
                  </td>
                </tr>
              ) : (
                offers.map((o) => (
                  <tr key={o.id} className="hover:bg-[#fff1f4]/40 transition">
                    <td className="px-6 py-4 font-semibold text-[#2b1233]">
                      <div>{o.name}</div>
                      {o.description && <div className="text-xs text-[#6f5569] font-normal">{o.description}</div>}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs font-bold text-[#d61c5d]">{o.offer_type}</td>
                    <td className="px-6 py-4 font-mono text-xs text-[#6f5569] max-w-xs truncate">
                      {o.configuration_json}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-[#6f5569]">
                      {o.usage_count} / {o.usage_limit ?? '∞'}
                    </td>
                    <td className="px-6 py-4">
                      {o.active ? (
                        <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-[#bfe3a6] text-[#2b1233]">
                          ACTIVE
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-[#f4d3dd]/50 text-[#6f5569]">
                          INACTIVE
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right space-x-1.5">
                      <button
                        onClick={() => handleOpenEditOffer(o)}
                        className="px-3 py-1 bg-white hover:bg-[#fff1f4] border border-[#f4d3dd] text-[#2b1233] text-xs font-bold rounded-full transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleOfferActive(o)}
                        className={`px-3 py-1 bg-white border text-xs font-bold rounded-full transition ${
                          o.active
                            ? 'hover:bg-rose-50 border-rose-200 text-rose-600'
                            : 'hover:bg-emerald-50 border-emerald-200 text-emerald-600'
                        }`}
                      >
                        {o.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Coupon Modal */}
      {showCouponModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2b1233]/45 backdrop-blur-sm p-4">
          <div className="bg-white border border-[#f4d3dd] rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold font-display text-[#2b1233]">
              {editingCouponId ? 'Edit Branch Coupon' : 'Create Branch Coupon'}
            </h3>

            {modalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveCoupon} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#6f5569] mb-1">Coupon Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. MELT20"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    className="w-full px-3.5 py-2.5 bg-[#fff1f4] border border-[#f4d3dd] rounded-2xl text-[#2b1233] font-mono text-sm uppercase focus:outline-none focus:border-[#d61c5d] focus:bg-white transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6f5569] mb-1">Coupon Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 20% Weekend Promo"
                    value={couponName}
                    onChange={(e) => setCouponName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#fff1f4] border border-[#f4d3dd] rounded-2xl text-[#2b1233] text-sm focus:outline-none focus:border-[#d61c5d] focus:bg-white transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#6f5569] mb-1">Discount Type</label>
                  <select
                    value={couponDiscountType}
                    onChange={(e) => setCouponDiscountType(e.target.value as DiscountType)}
                    className="w-full px-3.5 py-2.5 bg-[#fff1f4] border border-[#f4d3dd] rounded-2xl text-[#2b1233] text-sm focus:outline-none focus:border-[#d61c5d] focus:bg-white transition"
                  >
                    <option value={DiscountType.PERCENTAGE}>Percentage (%)</option>
                    <option value={DiscountType.FIXED}>Fixed (₹)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6f5569] mb-1">Discount Value *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder={couponDiscountType === DiscountType.PERCENTAGE ? 'e.g. 20' : 'e.g. 50'}
                    value={couponDiscountValue}
                    onChange={(e) => setCouponDiscountValue(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#fff1f4] border border-[#f4d3dd] rounded-2xl text-[#2b1233] text-sm focus:outline-none focus:border-[#d61c5d] focus:bg-white transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6f5569] mb-1">Max Cap (₹)</label>
                  <input
                    type="number"
                    placeholder="Optional"
                    value={couponMaxDiscount}
                    onChange={(e) => setCouponMaxDiscount(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#fff1f4] border border-[#f4d3dd] rounded-2xl text-[#2b1233] text-sm focus:outline-none focus:border-[#d61c5d] focus:bg-white transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#6f5569] mb-1">Min Order (₹)</label>
                  <input
                    type="number"
                    value={couponMinOrder}
                    onChange={(e) => setCouponMinOrder(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#fff1f4] border border-[#f4d3dd] rounded-2xl text-[#2b1233] text-sm focus:outline-none focus:border-[#d61c5d] focus:bg-white transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6f5569] mb-1">Total Limit</label>
                  <input
                    type="number"
                    placeholder="Unlimited"
                    value={couponTotalLimit}
                    onChange={(e) => setCouponTotalLimit(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#fff1f4] border border-[#f4d3dd] rounded-2xl text-[#2b1233] text-sm focus:outline-none focus:border-[#d61c5d] focus:bg-white transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6f5569] mb-1">Per User Limit</label>
                  <input
                    type="number"
                    placeholder="Unlimited"
                    value={couponUserLimit}
                    onChange={(e) => setCouponUserLimit(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#fff1f4] border border-[#f4d3dd] rounded-2xl text-[#2b1233] text-sm focus:outline-none focus:border-[#d61c5d] focus:bg-white transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#6f5569] mb-1">Daily Limit</label>
                  <input
                    type="number"
                    placeholder="Unlimited"
                    value={couponDailyLimit}
                    onChange={(e) => setCouponDailyLimit(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#fff1f4] border border-[#f4d3dd] rounded-2xl text-[#2b1233] text-sm focus:outline-none focus:border-[#d61c5d] focus:bg-white transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6f5569] mb-1">Start Date</label>
                  <input
                    type="date"
                    value={couponStartAt}
                    onChange={(e) => setCouponStartAt(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#fff1f4] border border-[#f4d3dd] rounded-2xl text-[#2b1233] text-sm focus:outline-none focus:border-[#d61c5d] focus:bg-white transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6f5569] mb-1">End Date</label>
                  <input
                    type="date"
                    value={couponEndAt}
                    onChange={(e) => setCouponEndAt(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#fff1f4] border border-[#f4d3dd] rounded-2xl text-[#2b1233] text-sm focus:outline-none focus:border-[#d61c5d] focus:bg-white transition"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCouponModal(false);
                    setEditingCouponId(null);
                  }}
                  disabled={modalSubmitting}
                  className="px-4 py-2 bg-white border border-[#f4d3dd] hover:bg-[#fff1f4] text-[#6f5569] text-xs font-bold rounded-full transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="px-5 py-2 bg-[#d61c5d] hover:bg-[#b8144e] disabled:opacity-50 text-white text-xs font-bold rounded-full transition shadow-[0_3px_0_#a3134a]"
                >
                  {modalSubmitting ? 'Saving...' : editingCouponId ? 'Save Changes' : 'Create Coupon'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create / Edit Offer Modal */}
      {showOfferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2b1233]/45 backdrop-blur-sm p-4">
          <div className="bg-white border border-[#f4d3dd] rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold font-display text-[#2b1233]">
              {editingOfferId ? 'Edit Branch Offer' : 'Create Branch Offer'}
            </h3>

            {modalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveOffer} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#6f5569] mb-1">Offer Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Summer Scoop Deal"
                  value={offerName}
                  onChange={(e) => setOfferName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#fff1f4] border border-[#f4d3dd] rounded-2xl text-[#2b1233] text-sm focus:outline-none focus:border-[#d61c5d] focus:bg-white transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#6f5569] mb-1">Offer Type</label>
                <select
                  value={offerType}
                  onChange={(e) => setOfferType(e.target.value as OfferType)}
                  className="w-full px-3.5 py-2.5 bg-[#fff1f4] border border-[#f4d3dd] rounded-2xl text-[#2b1233] text-sm focus:outline-none focus:border-[#d61c5d] focus:bg-white transition"
                >
                  <option value={OfferType.FLAT}>Flat Discount</option>
                  <option value={OfferType.COMBO}>Combo Deal</option>
                  <option value={OfferType.BUY_X_GET_Y}>Buy X Get Y</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#6f5569] mb-1">Discount Type</label>
                  <select
                    value={offerConfigType}
                    onChange={(e) => setOfferConfigType(e.target.value as 'PERCENTAGE' | 'FIXED')}
                    className="w-full px-3.5 py-2.5 bg-[#fff1f4] border border-[#f4d3dd] rounded-2xl text-[#2b1233] text-sm focus:outline-none focus:border-[#d61c5d] focus:bg-white transition"
                  >
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FIXED">Fixed (₹)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#6f5569] mb-1">Discount Value</label>
                  <input
                    type="number"
                    value={offerConfigVal}
                    onChange={(e) => setOfferConfigVal(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#fff1f4] border border-[#f4d3dd] rounded-2xl text-[#2b1233] text-sm focus:outline-none focus:border-[#d61c5d] focus:bg-white transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#6f5569] mb-1">Description</label>
                <input
                  type="text"
                  placeholder="Optional details"
                  value={offerDescription}
                  onChange={(e) => setOfferDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#fff1f4] border border-[#f4d3dd] rounded-2xl text-[#2b1233] text-sm focus:outline-none focus:border-[#d61c5d] focus:bg-white transition"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowOfferModal(false);
                    setEditingOfferId(null);
                  }}
                  disabled={modalSubmitting}
                  className="px-4 py-2 bg-white border border-[#f4d3dd] hover:bg-[#fff1f4] text-[#6f5569] text-xs font-bold rounded-full transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="px-5 py-2 bg-[#d61c5d] hover:bg-[#b8144e] disabled:opacity-50 text-white text-xs font-bold rounded-full transition shadow-[0_3px_0_#a3134a]"
                >
                  {modalSubmitting ? 'Saving...' : editingOfferId ? 'Save Changes' : 'Create Offer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

