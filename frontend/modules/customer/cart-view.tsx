'use client';

import React, { useState } from 'react';
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

  // Display-only totals calculated purely for user preview (Server is authoritative)
  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const couponDiscount = appliedCoupon ? appliedCoupon.discount : 0;
  const taxableAmount = Math.max(0, subtotal - couponDiscount);
  const tax = Math.round(taxableAmount * DEFAULT_TAX_RATE * 100) / 100;
  const total = Math.round((taxableAmount + tax) * 100) / 100;

  const handleApplyCoupon = async () => {
    if (!couponCodeInput.trim() || subtotal <= 0) return;
    setValidatingCoupon(true);
    setCouponError(null);

    try {
      const res = await orderApiClient.validateCoupon(branchId, couponCodeInput.trim(), subtotal);
      if (res.success && res.data.isValid) {
        setAppliedCoupon({
          code: couponCodeInput.trim().toUpperCase(),
          discount: res.data.discount,
        });
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
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
        <p className="text-base mb-2">Your cart is empty.</p>
        <p className="text-sm text-slate-500">Add some delicious ice cream from the catalog above!</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
      <div className="flex justify-between items-center border-b border-slate-800 pb-4">
        <h2 className="text-lg font-bold text-white">Your Cart ({items.length} items)</h2>
        <button
          onClick={onClearCart}
          className="text-xs text-rose-400 hover:text-rose-300 transition"
        >
          Clear All
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-950/40 border border-red-800 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Item List */}
      <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
        {items.map((item) => {
          const lineTotal = item.product.price * item.quantity;
          return (
            <div
              key={item.product.id}
              className="flex items-center justify-between p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg"
            >
              <div className="flex-1 mr-4">
                <h4 className="font-semibold text-white text-sm">{item.product.name}</h4>
                <p className="text-xs text-slate-400">₹{item.product.price.toFixed(2)} each</p>
              </div>

              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 rounded p-1">
                  <button
                    onClick={() => onUpdateQuantity(item.product.id, Math.max(1, item.quantity - 1))}
                    className="w-6 h-6 flex items-center justify-center text-slate-300 hover:text-white rounded"
                  >
                    -
                  </button>
                  <span className="w-6 text-center text-xs font-semibold text-white">{item.quantity}</span>
                  <button
                    onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                    className="w-6 h-6 flex items-center justify-center text-slate-300 hover:text-white rounded"
                  >
                    +
                  </button>
                </div>

                <span className="w-20 text-right font-bold text-sm text-amber-400">
                  ₹{lineTotal.toFixed(2)}
                </span>

                <button
                  onClick={() => onRemoveItem(item.product.id)}
                  className="text-slate-500 hover:text-rose-400 p-1 transition"
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
      <div className="border-t border-slate-800 pt-4">
        <label className="block text-xs font-semibold text-slate-400 mb-1.5">Have a Coupon?</label>
        {appliedCoupon ? (
          <div className="flex items-center justify-between p-2.5 bg-emerald-950/40 border border-emerald-800 rounded-lg">
            <div className="flex items-center space-x-2">
              <span className="text-emerald-400 font-bold text-xs uppercase bg-emerald-900/60 px-2 py-0.5 rounded">
                {appliedCoupon.code}
              </span>
              <span className="text-xs text-emerald-300">
                -₹{appliedCoupon.discount.toFixed(2)} applied
              </span>
            </div>
            <button
              onClick={handleRemoveCoupon}
              className="text-xs text-slate-400 hover:text-rose-400 transition"
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
                className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
              <button
                onClick={handleApplyCoupon}
                disabled={validatingCoupon || !couponCodeInput.trim()}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-medium text-xs rounded-lg transition"
              >
                {validatingCoupon ? 'Checking...' : 'Apply'}
              </button>
            </div>
            {couponError && (
              <p className="text-xs text-rose-400">{couponError}</p>
            )}
          </div>
        )}
      </div>

      {/* Summary (Display only - Authoritative totals calculated by server) */}
      <div className="border-t border-slate-800 pt-4 space-y-2">
        <div className="flex justify-between text-sm text-slate-400">
          <span>Subtotal</span>
          <span>₹{subtotal.toFixed(2)}</span>
        </div>
        {appliedCoupon && (
          <div className="flex justify-between text-sm text-emerald-400">
            <span>Coupon Discount ({appliedCoupon.code})</span>
            <span>-₹{couponDiscount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm text-slate-400">
          <span>Estimated Tax (5%)</span>
          <span>₹{tax.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-base font-bold text-white pt-2 border-t border-slate-800">
          <span>Estimated Total</span>
          <span className="text-amber-400">₹{total.toFixed(2)}</span>
        </div>
        <p className="text-xs text-slate-500 text-center italic pt-1">
          * Final price and taxes are authoritatively verified by the server upon placement.
        </p>
      </div>

      {/* Checkout Button */}
      <button
        onClick={handleCheckout}
        disabled={submitting || items.length === 0}
        className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold rounded-lg transition shadow-md flex items-center justify-center space-x-2"
      >
        {submitting ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-slate-950 mr-2"></div>
            <span>Placing Order...</span>
          </>
        ) : (
          <span>Place Order (Pay at Reception)</span>
        )}
      </button>
    </div>
  );
};
