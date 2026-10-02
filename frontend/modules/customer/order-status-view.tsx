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

  const refetchOrder = React.useCallback(() => {
    orderApiClient
      .getCustomerOrderDetail(orderId)
      .then((res) => {
        if (res.success) {
          setOrder(res.data.order);
          setItems(res.data.items);
          setPayments(res.data.payments);
        }
      })
      .catch(() => {});
  }, [orderId]);

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
        setOrder((prev) => (prev ? { ...prev, status: OrderStatus.EXPIRED } : null));
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [order]);

  const getStatusColor = (status: OrderStatus) => {
    switch (status) {
      case OrderStatus.PENDING:
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case OrderStatus.CONFIRMED:
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      case OrderStatus.PREPARING:
        return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      case OrderStatus.READY:
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case OrderStatus.COMPLETED:
        return 'bg-emerald-600/20 text-emerald-400 border-emerald-600/40';
      case OrderStatus.EXPIRED:
      case OrderStatus.CANCELLED:
        return 'bg-red-500/20 text-red-300 border-red-500/40';
      default:
        return 'bg-slate-500/20 text-slate-300 border-slate-500/40';
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
      <div className="flex items-center justify-center p-12 text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mr-3"></div>
        <span>Loading order status...</span>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="p-6 bg-red-950/40 border border-red-800 rounded-lg text-red-300">
        <p className="font-semibold">Unable to display order</p>
        <p className="text-sm opacity-80">{error ?? 'Order not found'}</p>
        {onBackToCatalog && (
          <button
            onClick={onBackToCatalog}
            className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded text-sm"
          >
            Back to Catalog
          </button>
        )}
      </div>
    );
  }

  const isEditable = isWithinOrderEditWindow(new Date(order.placed_at), 60);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6 max-w-2xl mx-auto shadow-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-slate-800 gap-4">
        <div>
          <span className="text-xs font-mono uppercase tracking-wider text-slate-400">Order Reference</span>
          <h2 className="text-2xl font-black text-white tracking-tight">{order.order_number}</h2>
          <p className="text-xs text-slate-500 mt-1">Placed at {new Date(order.placed_at).toLocaleTimeString()}</p>
        </div>

        <div className="flex flex-col sm:items-end">
          <span
            className={`px-3 py-1 rounded-full text-xs font-bold border tracking-wide uppercase ${getStatusColor(
              order.status as OrderStatus,
            )}`}
          >
            {order.status}
          </span>
          <span className="text-xs text-slate-400 mt-1">Payment: {order.payment_status}</span>
        </div>
      </div>

      {/* Expiry Countdown Box for Pending Orders */}
      {order.status === OrderStatus.PENDING && (
        <div className="p-4 bg-amber-950/30 border border-amber-800/60 rounded-xl flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-amber-300">Pay at Reception</h4>
            <p className="text-xs text-amber-400/80">Please show this order number to the cashier.</p>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-400 block">Expires in</span>
            <span className="font-mono text-lg font-bold text-amber-400">
              {timeLeftMs > 0 ? formatRemainingTime(timeLeftMs) : 'Expired'}
            </span>
          </div>
        </div>
      )}

      {/* Items List */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Ordered Items</h3>
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex justify-between items-center py-2 border-b border-slate-800/60 text-sm"
            >
              <div>
                <span className="font-medium text-white">{item.product_name_snapshot}</span>
                <span className="text-xs text-slate-400 ml-2">× {item.quantity}</span>
              </div>
              <span className="font-semibold text-slate-200">₹{item.line_total.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div className="pt-2 space-y-1 text-sm border-t border-slate-800">
        <div className="flex justify-between text-slate-400">
          <span>Subtotal</span>
          <span>₹{order.subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-slate-400">
          <span>Tax</span>
          <span>₹{order.tax.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-slate-400">
          <span>Payment Status</span>
          <span className="text-emerald-400 font-medium">{order.payment_status}</span>
        </div>
        {payments.some((p) => p.status === PaymentStatus.VERIFIED) && (
          <div className="flex justify-between text-slate-400">
            <span>Verified Paid at Reception</span>
            <span className="text-emerald-400 font-medium">
              ₹{payments
                .filter((p) => p.status === PaymentStatus.VERIFIED)
                .reduce((sum, p) => sum + p.amount, 0)
                .toFixed(2)}
            </span>
          </div>
        )}
        <div className="flex justify-between text-base font-bold text-white pt-2 border-t border-slate-800/80">
          <span>Total Payable</span>
          <span className="text-amber-400 text-lg">₹{order.total.toFixed(2)}</span>
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="flex justify-between items-center pt-4 border-t border-slate-800">
        {onBackToCatalog && (
          <button
            onClick={onBackToCatalog}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg text-sm transition"
          >
            ← Back to Catalog
          </button>
        )}

        {isEditable && order.status !== OrderStatus.COMPLETED && order.status !== OrderStatus.CANCELLED && (
          <span className="text-xs text-slate-500 italic">
            Order can be modified by operator within 60 mins of order.
          </span>
        )}
      </div>
    </div>
  );
};
