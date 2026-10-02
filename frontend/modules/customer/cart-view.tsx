'use client';

import React, { useState, useEffect } from 'react';
import { orderApiClient } from '../../services/order-api-client';
import { CartItem } from './catalog-view';
import { CreateOrderResponseData } from '../../../shared/contracts/order.contract';
import { DEFAULT_TAX_RATE } from '../../../shared/constants/business.constants';

interface CartViewProps {
  branchId: string;
  items: CartItem[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onOrderCreated: (result: CreateOrderResponseData) => void;
  onClearCart: () => void;
}

export const CartView: React.FC<CartViewProps> = ({
  branchId,
  items,
  onUpdateQuantity,
  onRemoveItem,
  onOrderCreated,
  onClearCart,
}) => {
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Coupon state
  const [couponCodeInput, setCouponCodeInput] = useState<string>('');
  const [validatingCoupon, setValidatingCoupon] = useState<boolean>(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discount: number;
  } | null>(null);

  // Private / targeted coupons for this customer
  const [privateCoupons, setPrivateCoupons] = useState<Array<{
    id: string;
    coupon_code: string;
    title: string;
    discount_type: 'PERCENTAGE' | 'FIXED';
    discount_value: number;
    min_order_value: number;
    max_discount: number | null;
    expires_at: string;
  }>>([]);

  useEffect(() => {
    let active = true;
    const fetchPrivateCoupons = async () => {
      try {
        const res = await orderApiClient.getCustomerPrivateCoupons(branchId);
        if (active && res.success && Array.isArray(res.data)) {
          setPrivateCoupons(res.data);
        }
      } catch {
        // silent fail
      }
    };
    fetchPrivateCoupons();
    return () => {
      active = false;
    };
  }, [branchId]);

  // Display-only totals calculated purely for user preview (Server is authoritative)
  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const couponDiscount = appliedCoupon ? appliedCoupon.discount : 0;
  const taxableAmount = Math.max(0, subtotal - couponDiscount);
  const tax = Math.round(taxableAmount * DEFAULT_TAX_RATE * 100) / 100;
  const total = Math.round((taxableAmount + tax) * 100) / 100;

  const handleApplyCouponDirect = async (codeToApply: string) => {
    const cleanCode = codeToApply.trim().toUpperCase();
    if (!cleanCode || subtotal <= 0) return;
    setValidatingCoupon(true);
    setCouponError(null);

    try {
      const res = await orderApiClient.validateCoupon(branchId, cleanCode, subtotal);
      if (res.success && res.data.isValid) {
        setAppliedCoupon({
          code: cleanCode,
          discount: res.data.discount,
        });
        setCouponCodeInput(cleanCode);
      } else {
        setAppliedCoupon(null);
        setCouponError(res.success ? (res.data.reason ?? 'Coupon is not valid') : res.error.message);
      }
    } catch (err) {
      setAppliedCoupon(null);
      setCouponError(err instanceof Error ? err.message : 'Coupon validation failed');
    } finally {
      setValidatingCoupon(false);
    }
  };

  const handleApplyCoupon = async () => {
    await handleApplyCouponDirect(couponCodeInput);
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCodeInput('');
    setCouponError(null);
  };

  const handleCheckout = async () => {
    if (items.length === 0) return;
    setSubmitting(true);
    setError(null);

    try {
      // Security rule: Only sends branchId, items, and optional couponCode.
      // Server calculates authoritative totals, prices, discounts, and taxes.
      const payload = {
        branchId,
        items: items.map((i) => ({
          productId: i.product.id,
          quantity: i.quantity,
        })),
        couponCode: appliedCoupon?.code ?? undefined,
      };

      const res = await orderApiClient.createCustomerOrder(payload);
      if (res.success) {
        onClearCart();
        onOrderCreated(res.data);
      } else {
        setError(res.error.message || 'Failed to place order');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="bg-white border border-[#f4d3dd] rounded-3xl p-8 text-center text-[#6f5569] shadow-[0_10px_30px_-15px_rgba(120,20,60,0.12)]">
        <p className="font-display font-semibold text-lg text-[#2b1233] mb-2">Your cone is empty.</p>
        <p className="text-sm">Pick some delicious flavours from the scoops counter above!</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#f4d3dd] rounded-3xl p-6 md:p-8 space-y-6 shadow-[0_14px_40px_-16px_rgba(120,20,60,0.18)]">
      <div className="flex justify-between items-center border-b border-[#f4d3dd] pb-4">
        <h2 className="font-display text-xl font-bold text-[#2b1233]">Your Scoops ({items.length} items)</h2>
        <button
          onClick={onClearCart}
          className="text-xs font-bold text-[#d61c5d] hover:text-[#a3134a] transition uppercase tracking-wider"
        >
          Clear All
        </button>
      </div>

      {error && (
        <div className="p-4 bg-[#fff1f4] border border-[#f4d3dd] rounded-2xl text-[#d61c5d] text-sm font-semibold">
          {error}
        </div>
      )}

      {/* Item List */}
      <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
        {items.map((item) => {
          const lineTotal = item.product.price * item.quantity;
          return (
            <div
              key={item.product.id}
              className="flex items-center justify-between p-4 bg-[#fff1f4]/70 border border-[#f4d3dd] rounded-2xl"
            >
              <div className="flex-1 mr-4">
                <h4 className="font-display font-semibold text-[#2b1233] text-base">{item.product.name}</h4>
                <p className="text-xs text-[#6f5569] font-bold">₹{item.product.price.toFixed(2)} each</p>
              </div>

              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-1.5 bg-white border border-[#f4d3dd] rounded-full p-1 shadow-sm">
                  <button
                    onClick={() => onUpdateQuantity(item.product.id, Math.max(1, item.quantity - 1))}
                    className="w-6 h-6 flex items-center justify-center text-[#2b1233] hover:bg-[#fff1f4] rounded-full text-xs font-black transition"
                  >
                    -
                  </button>
                  <span className="w-6 text-center text-xs font-extrabold text-[#2b1233]">{item.quantity}</span>
                  <button
                    onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                    className="w-6 h-6 flex items-center justify-center text-[#2b1233] hover:bg-[#fff1f4] rounded-full text-xs font-black transition"
                  >
                    +
                  </button>
                </div>

                <span className="w-20 text-right font-black text-sm text-[#d61c5d]">
                  ₹{lineTotal.toFixed(2)}
                </span>

                <button
                  onClick={() => onRemoveItem(item.product.id)}
                  className="text-[#6f5569] hover:text-[#d61c5d] p-1 transition font-bold"
                  title="Remove item"
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Coupon Entry & Validation */}
      <div className="border-t border-[#f4d3dd] pt-4">
        {/* Targeted Private Offers assigned to this user */}
        {privateCoupons.length > 0 && !appliedCoupon && (
          <div className="mb-4 p-4 rounded-2xl bg-gradient-to-r from-[#fff0f5] via-[#ffe5ee] to-[#ffdce7] border-2 border-[#d61c5d]/30 shadow-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-base">🎁</span>
                <span className="text-[11px] font-black uppercase tracking-wider text-[#d61c5d] bg-white px-2.5 py-0.5 rounded-full shadow-xs">
                  Exclusive Offer For You
                </span>
              </div>
              <span className="text-[11px] text-[#6f5569] font-bold">
                {privateCoupons.length} {privateCoupons.length === 1 ? 'deal available' : 'deals available'}
              </span>
            </div>

            {privateCoupons.map((coupon) => (
              <div
                key={coupon.id}
                className="flex items-center justify-between p-3 bg-white/90 rounded-xl border border-[#f4d3dd] shadow-2xs"
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-display font-black text-sm text-[#2b1233] uppercase tracking-wide">
                      {coupon.coupon_code}
                    </span>
                    <span className="text-xs font-black text-[#d61c5d] bg-[#fff1f4] px-2 py-0.5 rounded-full border border-[#f4d3dd]">
                      {coupon.discount_type === 'PERCENTAGE'
                        ? `${coupon.discount_value}% OFF`
                        : `₹${coupon.discount_value} OFF`}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#6f5569] font-medium mt-0.5">
                    {coupon.min_order_value > 0 ? `Min order ₹${coupon.min_order_value} • ` : ''}
                    {coupon.title || 'Personalized offer from Melt'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleApplyCouponDirect(coupon.coupon_code)}
                  disabled={validatingCoupon}
                  className="px-3.5 py-1.5 bg-[#d61c5d] hover:bg-[#a3134a] disabled:opacity-50 text-white text-xs font-black rounded-full transition shadow-xs cursor-pointer"
                >
                  {validatingCoupon && couponCodeInput === coupon.coupon_code ? 'Applying...' : 'Apply Code'}
                </button>
              </div>
            ))}
          </div>
        )}

        <label className="block text-xs font-bold text-[#6f5569] uppercase tracking-wider mb-2">Have a Coupon?</label>
        {appliedCoupon ? (
          <div className="flex items-center justify-between p-3 bg-[#bfe3a6]/30 border border-[#bfe3a6] rounded-2xl">
            <div className="flex items-center space-x-2">
              <span className="text-[#2b1233] font-black text-xs uppercase bg-[#bfe3a6] px-3 py-1 rounded-full">
                {appliedCoupon.code}
              </span>
              <span className="text-xs text-[#2b1233] font-extrabold">
                -₹{appliedCoupon.discount.toFixed(2)} applied
              </span>
            </div>
            <button
              onClick={handleRemoveCoupon}
              className="text-xs font-bold text-[#d61c5d] hover:text-[#a3134a] transition"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex space-x-2">
              <input
                type="text"
                placeholder="Enter coupon code"
                value={couponCodeInput}
                onChange={(e) => setCouponCodeInput(e.target.value.toUpperCase())}
                className="flex-1 px-4 py-2.5 bg-white border border-[#f4d3dd] rounded-full text-sm text-[#2b1233] placeholder-[#6f5569]/60 font-semibold focus:outline-none focus:border-[#d61c5d]"
              />
              <button
                onClick={handleApplyCoupon}
                disabled={validatingCoupon || !couponCodeInput.trim()}
                className="px-5 py-2.5 bg-[#2b1233] hover:bg-[#431d4e] disabled:opacity-50 text-white font-extrabold text-xs rounded-full transition shadow-sm"
              >
                {validatingCoupon ? 'Checking...' : 'Apply'}
              </button>
            </div>
            {couponError && (
              <p className="text-xs text-[#d61c5d] font-bold pl-3">{couponError}</p>
            )}
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="border-t border-[#f4d3dd] pt-4 space-y-2">
        <div className="flex justify-between text-sm text-[#6f5569] font-medium">
          <span>Subtotal</span>
          <span className="text-[#2b1233] font-bold">₹{subtotal.toFixed(2)}</span>
        </div>
        {appliedCoupon && (
          <div className="flex justify-between text-sm text-[#2b1233] font-extrabold">
            <span>Coupon Discount ({appliedCoupon.code})</span>
            <span className="text-[#d61c5d]">-₹{couponDiscount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm text-[#6f5569] font-medium">
          <span>Estimated GST (5%)</span>
          <span className="text-[#2b1233] font-bold">₹{tax.toFixed(2)}</span>
        </div>
        <div className="text-xs text-[#6f5569]/80 pl-2 space-y-0.5">
          <div className="flex justify-between">
            <span>&bull; SGST (2.5%):</span>
            <span>₹{(tax / 2).toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>&bull; CGST (2.5%):</span>
            <span>₹{(tax / 2).toFixed(2)}</span>
          </div>
        </div>
        <div className="flex justify-between text-base font-black text-[#2b1233] pt-3 border-t border-[#f4d3dd]">
          <span className="font-display text-lg">Estimated Total</span>
          <span className="font-display text-xl text-[#d61c5d]">₹{total.toFixed(2)}</span>
        </div>
        <p className="text-xs text-[#6f5569] text-center italic pt-1">
          * Final price and taxes are verified at reception.
        </p>
      </div>

      {/* Checkout Button */}
      <button
        onClick={handleCheckout}
        disabled={submitting || items.length === 0}
        className="w-full py-4 bg-[#d61c5d] hover:bg-[#c21853] disabled:opacity-50 text-white font-extrabold text-base rounded-full transition shadow-[0_5px_0_#a3134a] hover:translate-y-[2px] hover:shadow-[0_2px_0_#a3134a] flex items-center justify-center space-x-2"
      >
        {submitting ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
            <span>Placing Order...</span>
          </>
        ) : (
          <span>Place Order (Pay at Reception)</span>
        )}
      </button>
    </div>
  );
};
