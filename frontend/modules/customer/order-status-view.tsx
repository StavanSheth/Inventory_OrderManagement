'use client';

import React, { useState, useEffect } from 'react';
import { orderApiClient } from '../../services/order-api-client';
import { realtimeClient } from '../../services/realtime-client';
import { Order, OrderItem, Payment } from '../../../shared/types/entities.types';
import { OrderStatus, PaymentStatus } from '../../../shared/enums/order.enum';
import { isWithinOrderEditWindow } from '../../../shared/business-rules/order-rules';

interface OrderStatusViewProps {
  orderId: string;
  onBackToCatalog?: () => void;
}

export const OrderStatusView: React.FC<OrderStatusViewProps> = ({ orderId, onBackToCatalog }) => {
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [timeLeftMs, setTimeLeftMs] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [cancelling, setCancelling] = useState<boolean>(false);

  const refetchOrder = React.useCallback(async () => {
    try {
      const res = await orderApiClient.getCustomerOrderDetail(orderId);
      if (res.success) {
        setOrder(res.data.order);
        setItems(res.data.items);
        setPayments(res.data.payments);
      }
    } catch {
      // silently handle background refetch failure
    }
  }, [orderId]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await refetchOrder();
    setTimeout(() => setIsRefreshing(false), 400);
  };

  const handleCustomerCancel = async () => {
    if (!confirm('Are you sure you want to cancel this order?')) return;
    setCancelling(true);
    try {
      const res = await orderApiClient.cancelCustomerOrder(orderId);
      if (res.success) {
        setOrder(res.data);
      } else {
        alert(res.error.message || 'Failed to cancel order');
      }
    } catch {
      alert('Network error while cancelling order');
    } finally {
      setCancelling(false);
    }
  };

  // Fetch initial details
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    orderApiClient
      .getCustomerOrderDetail(orderId)
      .then((res) => {
        if (!isMounted) return;
        if (res.success) {
          setOrder(res.data.order);
          setItems(res.data.items);
          setPayments(res.data.payments);
        } else {
          setError(res.error.message || 'Failed to load order');
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Network error');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [orderId]);

  // Connect to authorized Realtime SSE channel with authoritative refetch on reconnect
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    realtimeClient
      .subscribe({
        orderId,
        onConnected: () => {
          refetchOrder();
        },
        onEvent: (event) => {
          if (event.type === 'OrderStatusChanged') {
            setOrder((prev) => (prev ? { ...prev, status: event.payload.status, payment_status: event.payload.paymentStatus } : null));
          } else if (event.type === 'PaymentUpdated') {
            setOrder((prev) => (prev ? { ...prev, payment_status: event.payload.status } : null));
          } else if (event.type === 'OrderUpdated') {
            setOrder((prev) => (prev ? { ...prev, total: event.payload.newTotal } : null));
            refetchOrder();
          }
        },
      })
      .then((unsub) => {
        unsubscribe = unsub;
      })
      .catch(() => {
        // SSE error or unsupported, fallback to polling
      });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [orderId, refetchOrder]);

  // Expiry countdown timer
  useEffect(() => {
    if (!order || order.status !== OrderStatus.PENDING) return;

    const interval = setInterval(() => {
      const remaining = new Date(order.expires_at).getTime() - Date.now();
      setTimeLeftMs(Math.max(0, remaining));
      if (remaining <= 0) {
        clearInterval(interval);
        refetchOrder();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [order, refetchOrder]);

  const getStatusColor = (status: OrderStatus) => {
    switch (status) {
      case OrderStatus.PENDING:
        return 'bg-[#ffcf4d] text-[#2b1233] border-[#ffcf4d]';
      case OrderStatus.CONFIRMED:
        return 'bg-[#bfe3a6] text-[#2b1233] border-[#bfe3a6]';
      case OrderStatus.PREPARING:
        return 'bg-[#ecd3b4] text-[#2b1233] border-[#ecd3b4]';
      case OrderStatus.READY:
        return 'bg-[#a9bfff] text-[#2b1233] border-[#a9bfff]';
      case OrderStatus.COMPLETED:
        return 'bg-[#ffc2d4] text-[#2b1233] border-[#ffc2d4]';
      case OrderStatus.EXPIRED:
      case OrderStatus.CANCELLED:
        return 'bg-[#fecdd3] text-[#9f1239] border-[#fecdd3]';
      default:
        return 'bg-[#fff1f4] text-[#6f5569] border-[#f4d3dd]';
    }
  };

  const formatRemainingTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-[#6f5569]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#d61c5d] mr-3"></div>
        <span className="font-bold text-sm">Tracking your scoop...</span>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="p-6 bg-white border border-[#f4d3dd] rounded-3xl text-[#d61c5d] shadow-sm max-w-lg mx-auto">
        <p className="font-bold text-base">Unable to display order</p>
        <p className="text-sm opacity-80 mt-1">{error ?? 'Order not found'}</p>
        {onBackToCatalog && (
          <button
            onClick={onBackToCatalog}
            className="mt-4 px-5 py-2 bg-[#d61c5d] hover:bg-[#c21853] text-white rounded-full text-xs font-extrabold transition shadow-sm"
          >
            Back to Counter
          </button>
        )}
      </div>
    );
  }

  const isEditable = isWithinOrderEditWindow(new Date(order.placed_at), 60);

  return (
    <div className="bg-white border border-[#f4d3dd] rounded-3xl p-6 md:p-8 space-y-6 max-w-2xl mx-auto shadow-[0_14px_40px_-16px_rgba(120,20,60,0.18)] text-[#2b1233]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-[#f4d3dd] gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#6f5569]">Order Reference</span>
          <h2 className="font-display text-3xl font-extrabold text-[#2b1233] tracking-tight">{order.order_number}</h2>
          <p className="text-xs text-[#6f5569] font-medium mt-1">Placed at {new Date(order.placed_at).toLocaleTimeString()}</p>
        </div>

        <div className="flex flex-col sm:items-end">
          <span
            className={`px-4 py-1.5 rounded-full text-xs font-black border tracking-wider uppercase ${getStatusColor(
              order.status as OrderStatus,
            )}`}
          >
            {order.status}
          </span>
          <span className="text-xs text-[#6f5569] font-bold mt-1.5">Payment: {order.payment_status}</span>
        </div>
      </div>

      {/* Synced Order Workflow Stages */}
      <div className="bg-[#fff1f4] p-4 rounded-2xl border border-[#f4d3dd]">
        <div className="flex justify-between items-center text-xs font-black uppercase tracking-wider text-[#6f5569] mb-3">
          <div className="flex items-center gap-2">
            <span>Live Order Tracking</span>
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="px-2.5 py-1 bg-white hover:bg-[#ffe3eb] border border-[#f4d3dd] text-[#d61c5d] rounded-full text-[11px] font-black tracking-normal transition flex items-center gap-1 shadow-xs cursor-pointer"
              title="Refresh order stage tracking"
            >
              <span className={isRefreshing ? 'animate-spin inline-block' : ''}>↻</span>
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
          <span className="text-[#d61c5d]">
            {order.status === OrderStatus.READY
              ? '🎉 Ready for pickup!'
              : order.status === OrderStatus.PREPARING
              ? '🍳 Crafting scoops...'
              : order.status === OrderStatus.CONFIRMED
              ? '💳 Payment confirmed'
              : order.status === OrderStatus.COMPLETED
              ? '✨ Collected'
              : order.status === OrderStatus.CANCELLED
              ? '🚫 Cancelled'
              : 'Payment Left'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { key: OrderStatus.CONFIRMED, label: '1. Payment done', icon: '💳' },
            { key: OrderStatus.PREPARING, label: '2. Preparing', icon: '🍳' },
            { key: OrderStatus.READY, label: '3. Ready', icon: '🍦' },
            { key: OrderStatus.COMPLETED, label: '4. Collected', icon: '🛍️' },
          ].map((st) => {
            const sequence = [
              OrderStatus.PENDING,
              OrderStatus.CONFIRMED,
              OrderStatus.PREPARING,
              OrderStatus.READY,
              OrderStatus.COMPLETED,
            ];
            const currentIdx = sequence.indexOf(order.status as OrderStatus);
            const stageIdx = sequence.indexOf(st.key);
            const isDone = currentIdx >= stageIdx;
            const isCurrent = currentIdx === stageIdx - 1;

            return (
              <div
                key={st.key}
                className={`py-2 px-3 rounded-xl text-center text-xs font-black flex items-center justify-center gap-1.5 transition-all ${
                  isDone
                    ? 'bg-[#dcfce7] border border-[#86efac] text-[#166534]'
                    : isCurrent
                    ? st.key === OrderStatus.PREPARING
                      ? 'bg-[#facc15] border border-[#eab308] text-[#713f12] shadow-sm animate-pulse'
                      : 'bg-[#d61c5d] text-white shadow-sm'
                    : 'bg-white/70 border border-[#f4d3dd] text-[#9d8695]'
                }`}
              >
                <span>{isDone ? '✓' : st.icon}</span>
                <span>{st.label}</span>
              </div>
            );
          })}
        </div>

        {/* Realtime Alert when Operator marks Ready */}
        {order.status === OrderStatus.READY && (
          <div className="mt-3.5 p-3.5 bg-[#dbeafe] border-2 border-[#3b82f6] rounded-xl text-center animate-bounce">
            <span className="font-display text-base font-black text-[#1e40af] block">
              🎉 YOUR ORDER IS READY AT THE COUNTER!
            </span>
            <span className="text-xs font-bold text-[#1e3a8a] mt-0.5 block">
              Please present Order #{order.order_number} to the staff to collect your treat!
            </span>
          </div>
        )}

        {/* Preparing Alert */}
        {order.status === OrderStatus.PREPARING && (
          <div className="mt-3 p-3 bg-[#fef08a] border border-[#eab308] rounded-xl text-center">
            <span className="text-xs font-extrabold text-[#854d0e]">
              🍳 Our scoop masters are preparing your fresh ice cream right now!
            </span>
          </div>
        )}
      </div>

      {/* Expiry Countdown Box for Pending Orders */}
      {order.status === OrderStatus.PENDING && (
        <div className="p-5 bg-[#ffcf4d]/25 border border-[#ffcf4d] rounded-2xl flex items-center justify-between">
          <div>
            <h4 className="text-sm font-black text-[#2b1233]">Pay at Reception</h4>
            <p className="text-xs text-[#2b1233]/80 font-medium">Please show this order reference to the cashier.</p>
          </div>
          <div className="text-right">
            <span className="text-xs text-[#6f5569] block font-bold">Expires in</span>
            <span className="font-display text-xl font-black text-[#d61c5d]">
              {timeLeftMs > 0 ? formatRemainingTime(timeLeftMs) : 'Expired'}
            </span>
          </div>
        </div>
      )}

      {/* Items List */}
      <div className="space-y-3">
        <h3 className="text-xs font-extrabold text-[#6f5569] uppercase tracking-wider">Ordered Items</h3>
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex justify-between items-center py-2.5 border-b border-[#f4d3dd]/60 text-sm"
            >
              <div>
                <span className="font-bold text-[#2b1233]">{item.product_name_snapshot}</span>
                <span className="text-xs text-[#6f5569] ml-2 font-extrabold">× {item.quantity}</span>
              </div>
              <span className="font-extrabold text-[#2b1233]">₹{item.line_total.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div className="pt-2 space-y-1.5 text-sm border-t border-[#f4d3dd]">
        <div className="flex justify-between text-[#6f5569] font-medium">
          <span>Subtotal</span>
          <span className="text-[#2b1233] font-bold">₹{order.subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-[#6f5569] font-medium">
          <span>Tax (GST)</span>
          <span className="text-[#2b1233] font-bold">₹{order.tax.toFixed(2)}</span>
        </div>
        <div className="text-xs text-[#6f5569]/80 pl-2 space-y-0.5">
          <div className="flex justify-between">
            <span>&bull; SGST (2.5%):</span>
            <span>₹{(order.tax / 2).toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>&bull; CGST (2.5%):</span>
            <span>₹{(order.tax / 2).toFixed(2)}</span>
          </div>
        </div>
        <div className="flex justify-between text-[#6f5569] font-medium">
          <span>Payment Status</span>
          <span className="text-[#d61c5d] font-extrabold">{order.payment_status}</span>
        </div>
        {payments.some((p) => p.status === PaymentStatus.VERIFIED) && (
          <div className="flex justify-between text-[#6f5569] font-medium">
            <span>Verified Paid at Reception</span>
            <span className="text-[#2b1233] font-bold">
              ₹{payments
                .filter((p) => p.status === PaymentStatus.VERIFIED)
                .reduce((sum, p) => sum + p.amount, 0)
                .toFixed(2)}
            </span>
          </div>
        )}
        <div className="flex justify-between text-base font-extrabold text-[#2b1233] pt-3 border-t border-[#f4d3dd]">
          <span className="font-display text-lg">Total Payable</span>
          <span className="font-display text-2xl text-[#d61c5d]">₹{order.total.toFixed(2)}</span>
        </div>
      </div>

      {/* Footer Navigation & Customer Cancel Order Option */}
      <div className="flex flex-col sm:flex-row justify-between items-center pt-4 border-t border-[#f4d3dd] gap-3">
        {onBackToCatalog && (
          <button
            onClick={onBackToCatalog}
            className="px-5 py-2.5 bg-[#fff1f4] hover:bg-white border border-[#f4d3dd] text-[#2b1233] font-extrabold rounded-full text-xs transition shadow-sm cursor-pointer"
          >
            ← Back to Counter
          </button>
        )}

        {/* Customer can cancel order IF payment done stage is not done (i.e. status is PENDING) */}
        {order.status === OrderStatus.PENDING && (
          <button
            type="button"
            onClick={handleCustomerCancel}
            disabled={cancelling}
            className="px-4 py-2 bg-white hover:bg-[#fee2e2] border border-[#fca5a5] text-[#b91c1c] font-black rounded-full text-xs transition shadow-xs cursor-pointer flex items-center gap-1.5"
          >
            <span>✕</span>
            <span>{cancelling ? 'Cancelling...' : 'Cancel Order'}</span>
          </button>
        )}

        {isEditable && order.status !== OrderStatus.COMPLETED && order.status !== OrderStatus.CANCELLED && order.status !== OrderStatus.PENDING && (
          <span className="text-xs text-[#6f5569] italic">
            Order can be modified at reception within 60 mins.
          </span>
        )}
      </div>
    </div>
  );
};
