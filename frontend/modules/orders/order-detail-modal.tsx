'use client';

import React, { useState, useEffect } from 'react';
import { orderApiClient } from '../../services/order-api-client';
import { Order, OrderItem, Payment } from '../../../shared/types/entities.types';
import { OrderStatus, PaymentStatus } from '../../../shared/enums/order.enum';
import { isWithinOrderEditWindow, isOrderEditable } from '../../../shared/business-rules/order-rules';

interface OrderDetailModalProps {
  branchId: string;
  orderId: string;
  onClose: () => void;
  onOpenPayment: (order: Order, payments: Payment[]) => void;
  onOpenEdit: (order: Order, items: OrderItem[], payments: Payment[]) => void;
  onStatusChanged: () => void;
}

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  branchId,
  orderId,
  onClose,
  onOpenPayment,
  onOpenEdit,
  onStatusChanged,
}) => {
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [updatingStatus, setUpdatingStatus] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await orderApiClient.getBranchOrderDetail(branchId, orderId);
      if (res.success) {
        setOrder(res.data.order);
        setItems(res.data.items);
        setPayments(res.data.payments);
      } else {
        setError(res.error.message || 'Failed to load order detail');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [branchId, orderId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleStatusTransition = async (newStatus: OrderStatus) => {
    setUpdatingStatus(true);
    setError(null);
    try {
      const res = await orderApiClient.updateOrderStatus(branchId, orderId, newStatus);
      if (res.success) {
        await fetchDetail();
        onStatusChanged();
      } else {
        setError(res.error?.message ?? `Failed to transition status to ${newStatus}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleConfirmOrder = async () => {
    setUpdatingStatus(true);
    setError(null);
    try {
      const res = await orderApiClient.confirmOrder(branchId, orderId);
      if (res.success) {
        await fetchDetail();
        onStatusChanged();
      } else {
        setError(res.error?.message ?? 'Failed to confirm order');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}
      >
        <div style={{ background: '#ffffff', padding: '2rem', borderRadius: '8px' }}>
          Loading order details...
        </div>
      </div>
    );
  }

  if (!order) {
    return null;
  }

  const editWindowValid = isWithinOrderEditWindow(new Date(order.confirmed_at ?? order.placed_at));
  const canEdit = isOrderEditable(order);

  const verifiedPaid = payments
    .filter((p) => p.status === PaymentStatus.VERIFIED)
    .reduce((sum, p) => sum + p.amount, 0);

  const isExpired = order.status === OrderStatus.PENDING && new Date(order.expires_at).getTime() <= Date.now();

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(43, 18, 51, 0.45)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '1.75rem',
          maxWidth: '700px',
          width: '100%',
          padding: '1.75rem',
          border: '1px solid #f4d3dd',
          boxShadow: '0 25px 50px -12px rgba(120, 20, 60, 0.25)',
          maxHeight: '90vh',
          overflowY: 'auto',
          fontFamily: 'var(--font-body-family), system-ui, sans-serif',
          color: '#2b1233',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display-family)', fontSize: '1.5rem', fontWeight: 700, margin: 0, color: '#2b1233' }}>
                {order.order_number}
              </h2>
              <span
                style={{
                  padding: '0.3rem 0.8rem',
                  borderRadius: '9999px',
                  background: '#ffc2d4',
                  color: '#2b1233',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                }}
              >
                {order.status}
              </span>
            </div>
            <div style={{ color: '#6f5569', fontSize: '0.8125rem', marginTop: '0.25rem', fontWeight: 600 }}>
              Customer: <span style={{ fontWeight: 800, color: '#2b1233' }}>{order.customer_user_id}</span> &bull; Placed:{' '}
              {new Date(order.placed_at).toLocaleString()}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#fff1f4',
              border: '1px solid #f4d3dd',
              borderRadius: '9999px',
              width: '32px',
              height: '32px',
              fontSize: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#6f5569',
              fontWeight: 'bold',
            }}
          >
            &times;
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: '0.85rem 1rem',
              background: '#ffffff',
              border: '1px solid #f4d3dd',
              borderRadius: '1rem',
              color: '#d61c5d',
              fontSize: '0.875rem',
              marginBottom: '1rem',
              fontWeight: 700,
            }}
          >
            {error}
          </div>
        )}

        {/* Status & Expiry Bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '0.75rem',
            background: '#fff1f4',
            border: '1px solid #f4d3dd',
            borderRadius: '1.25rem',
            padding: '1rem 1.25rem',
            marginBottom: '1.25rem',
            fontSize: '0.875rem',
          }}
        >
          <div>
            <div style={{ color: '#6f5569', fontSize: '0.75rem', fontWeight: 700 }}>Payment Status</div>
            <div style={{ fontWeight: 800, color: '#2b1233' }}>{order.payment_status}</div>
          </div>
          <div>
            <div style={{ color: '#6f5569', fontSize: '0.75rem', fontWeight: 700 }}>Expiry Time</div>
            <div style={{ fontWeight: 800, color: isExpired ? '#d61c5d' : '#2b1233' }}>
              {new Date(order.expires_at).toLocaleTimeString()}{' '}
              {isExpired ? '(Expired)' : ''}
            </div>
          </div>
          <div>
            <div style={{ color: '#6f5569', fontSize: '0.75rem', fontWeight: 700 }}>60-Min Edit Window</div>
            <div style={{ fontWeight: 800, color: editWindowValid ? '#2b1233' : '#6f5569' }}>
              {editWindowValid ? 'Active' : 'Closed'}
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#2b1233', marginBottom: '0.5rem' }}>
            Ordered Items ({items.length})
          </h3>
          <div style={{ border: '1px solid #f4d3dd', borderRadius: '1rem', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#fff1f4', borderBottom: '1px solid #f4d3dd', textAlign: 'left' }}>
                  <th style={{ padding: '0.65rem 1rem', color: '#6f5569', fontWeight: 800 }}>Item</th>
                  <th style={{ padding: '0.65rem 1rem', color: '#6f5569', fontWeight: 800, textAlign: 'center' }}>Qty</th>
                  <th style={{ padding: '0.65rem 1rem', color: '#6f5569', fontWeight: 800, textAlign: 'right' }}>Price</th>
                  <th style={{ padding: '0.65rem 1rem', color: '#6f5569', fontWeight: 800, textAlign: 'right' }}>Line Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} style={{ borderBottom: '1px solid #f4d3dd/60' }}>
                    <td style={{ padding: '0.65rem 1rem', fontWeight: 700, color: '#2b1233' }}>
                      {it.product_name_snapshot}
                    </td>
                    <td style={{ padding: '0.65rem 1rem', textAlign: 'center', color: '#2b1233', fontWeight: 700 }}>
                      {it.quantity}
                    </td>
                    <td style={{ padding: '0.65rem 1rem', textAlign: 'right', color: '#6f5569', fontWeight: 600 }}>
                      ₹{it.unit_price_snapshot.toFixed(2)}
                    </td>
                    <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: 800, color: '#2b1233' }}>
                      ₹{it.line_total.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Financial Summary */}
        <div
          style={{
            background: '#fff1f4',
            border: '1px solid #f4d3dd',
            borderRadius: '1.25rem',
            padding: '1.15rem 1.25rem',
            marginBottom: '1.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ color: '#6f5569', fontSize: '0.8125rem', fontWeight: 600 }}>
              Subtotal: ₹{order.subtotal.toFixed(2)} &bull; GST (5%): ₹{order.tax.toFixed(2)} (SGST: ₹{(order.tax / 2).toFixed(2)} + CGST: ₹{(order.tax / 2).toFixed(2)})
            </div>
            <div style={{ color: '#2b1233', fontSize: '0.8125rem', fontWeight: 800, marginTop: '0.2rem' }}>
              Verified Paid at Reception: ₹{verifiedPaid.toFixed(2)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', color: '#6f5569', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800 }}>
              Total Amount
            </div>
            <div style={{ fontFamily: 'var(--font-display-family)', fontSize: '1.65rem', fontWeight: 800, color: '#d61c5d' }}>
              ₹{order.total.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Reception & Status Actions */}
        <div style={{ borderTop: '1px solid #f4d3dd', paddingTop: '1.25rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => onOpenPayment(order, payments)}
              style={{
                padding: '0.55rem 1.25rem',
                background: '#d61c5d',
                color: '#ffffff',
                border: 'none',
                borderRadius: '9999px',
                fontWeight: 800,
                fontSize: '0.8125rem',
                cursor: 'pointer',
                boxShadow: '0 3px 0 #a3134a',
                transition: 'all 0.15s ease',
              }}
            >
              Reception Payment
            </button>

            {canEdit && (
              <button
                type="button"
                onClick={() => onOpenEdit(order, items, payments)}
                style={{
                  padding: '0.55rem 1.25rem',
                  background: '#ffffff',
                  color: '#2b1233',
                  border: '1px solid #f4d3dd',
                  borderRadius: '9999px',
                  fontWeight: 800,
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                Edit Order Items
              </button>
            )}
          </div>

          {/* Lifecycle Transitions for Confirmed/Preparing/Ready */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {order.status === OrderStatus.PENDING && (
              <button
                type="button"
                disabled={updatingStatus}
                onClick={
                  order.payment_status === PaymentStatus.VERIFIED ||
                  order.payment_status === PaymentStatus.COMPLETED
                    ? handleConfirmOrder
                    : () => onOpenPayment(order, payments)
                }
                style={{
                  padding: '0.55rem 1.25rem',
                  background:
                    order.payment_status === PaymentStatus.VERIFIED ||
                    order.payment_status === PaymentStatus.COMPLETED
                      ? '#16a34a'
                      : '#d61c5d',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '9999px',
                  fontWeight: 800,
                  fontSize: '0.8125rem',
                  cursor: updatingStatus ? 'not-allowed' : 'pointer',
                  boxShadow: '0 3px 0 rgba(0,0,0,0.15)',
                }}
              >
                {order.payment_status === PaymentStatus.VERIFIED ||
                order.payment_status === PaymentStatus.COMPLETED
                  ? 'Confirm Order (Payment Done)'
                  : 'Record Payment to Confirm'}
              </button>
            )}

            {order.status === OrderStatus.CONFIRMED && (
              <button
                type="button"
                disabled={updatingStatus}
                onClick={() => handleStatusTransition(OrderStatus.PREPARING)}
                style={{
                  padding: '0.55rem 1.25rem',
                  background: '#ffcf4d',
                  color: '#2b1233',
                  border: 'none',
                  borderRadius: '9999px',
                  fontWeight: 800,
                  fontSize: '0.8125rem',
                  cursor: updatingStatus ? 'not-allowed' : 'pointer',
                }}
              >
                Start Preparing
              </button>
            )}

            {order.status === OrderStatus.PREPARING && (
              <button
                type="button"
                disabled={updatingStatus}
                onClick={() => handleStatusTransition(OrderStatus.READY)}
                style={{
                  padding: '0.55rem 1.25rem',
                  background: '#a9bfff',
                  color: '#2b1233',
                  border: 'none',
                  borderRadius: '9999px',
                  fontWeight: 800,
                  fontSize: '0.8125rem',
                  cursor: updatingStatus ? 'not-allowed' : 'pointer',
                }}
              >
                Mark Ready
              </button>
            )}

            {order.status === OrderStatus.READY && (
              <button
                type="button"
                disabled={updatingStatus}
                onClick={() => handleStatusTransition(OrderStatus.COMPLETED)}
                style={{
                  padding: '0.55rem 1.25rem',
                  background: '#ffc2d4',
                  color: '#2b1233',
                  border: 'none',
                  borderRadius: '9999px',
                  fontWeight: 800,
                  fontSize: '0.8125rem',
                  cursor: updatingStatus ? 'not-allowed' : 'pointer',
                }}
              >
                Complete Order
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
