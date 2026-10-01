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

  const editWindowValid = isWithinOrderEditWindow(new Date(order.confirmed_at ?? order.placed_at), 60);
  const canEdit = isOrderEditable(order, 60);

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
        background: 'rgba(0,0,0,0.5)',
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
          borderRadius: '12px',
          maxWidth: '700px',
          width: '100%',
          padding: '1.75rem',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
          maxHeight: '90vh',
          overflowY: 'auto',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0, color: '#111827' }}>
                {order.order_number}
              </h2>
              <span
                style={{
                  padding: '0.25rem 0.65rem',
                  borderRadius: '9999px',
                  background: '#e0e7ff',
                  color: '#3730a3',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}
              >
                {order.status}
              </span>
            </div>
            <div style={{ color: '#6b7280', fontSize: '0.8125rem', marginTop: '0.25rem' }}>
              Customer: <span style={{ fontWeight: 600, color: '#374151' }}>{order.customer_user_id}</span> &bull; Placed:{' '}
              {new Date(order.placed_at).toLocaleString()}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              lineHeight: 1,
              cursor: 'pointer',
              color: '#9ca3af',
            }}
          >
            &times;
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: '0.75rem',
              background: '#fee2e2',
              border: '1px solid #f87171',
              borderRadius: '6px',
              color: '#b91c1c',
              fontSize: '0.875rem',
              marginBottom: '1rem',
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
            background: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.25rem',
            fontSize: '0.875rem',
          }}
        >
          <div>
            <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>Payment Status</div>
            <div style={{ fontWeight: 700, color: '#111827' }}>{order.payment_status}</div>
          </div>
          <div>
            <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>Expiry Time</div>
            <div style={{ fontWeight: 600, color: isExpired ? '#dc2626' : '#111827' }}>
              {new Date(order.expires_at).toLocaleTimeString()}{' '}
              {isExpired ? '(Expired)' : ''}
            </div>
          </div>
          <div>
            <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>60-Min Edit Window</div>
            <div style={{ fontWeight: 600, color: editWindowValid ? '#16a34a' : '#9ca3af' }}>
              {editWindowValid ? 'Active' : 'Closed'}
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>
            Ordered Items ({items.length})
          </h3>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem 0.75rem', color: '#4b5563', fontWeight: 600 }}>Item</th>
                  <th style={{ padding: '0.5rem 0.75rem', color: '#4b5563', fontWeight: 600, textAlign: 'center' }}>Qty</th>
                  <th style={{ padding: '0.5rem 0.75rem', color: '#4b5563', fontWeight: 600, textAlign: 'right' }}>Price</th>
                  <th style={{ padding: '0.5rem 0.75rem', color: '#4b5563', fontWeight: 600, textAlign: 'right' }}>Line Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 500, color: '#111827' }}>
                      {it.product_name_snapshot}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: '#374151' }}>
                      {it.quantity}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: '#374151' }}>
                      ₹{it.unit_price_snapshot.toFixed(2)}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 600, color: '#111827' }}>
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
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ color: '#64748b', fontSize: '0.8125rem' }}>
              Subtotal: ₹{order.subtotal.toFixed(2)} &bull; Tax: ₹{order.tax.toFixed(2)}
            </div>
            <div style={{ color: '#16a34a', fontSize: '0.8125rem' }}>
              Verified Paid at Reception: ₹{verifiedPaid.toFixed(2)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Total Amount
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>
              ₹{order.total.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Reception & Status Actions */}
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1.25rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => onOpenPayment(order, payments)}
              style={{
                padding: '0.5rem 1rem',
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              Reception Payment
            </button>

            {canEdit && (
              <button
                type="button"
                onClick={() => onOpenEdit(order, items, payments)}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#f3f4f6',
                  color: '#1f2937',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                Edit Order Items
              </button>
            )}
          </div>

          {/* Lifecycle Transitions for Confirmed/Preparing/Ready */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {order.status === OrderStatus.CONFIRMED && (
              <button
                type="button"
                disabled={updatingStatus}
                onClick={() => handleStatusTransition(OrderStatus.PREPARING)}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#eab308',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.875rem',
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
                  padding: '0.5rem 1rem',
                  background: '#10b981',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.875rem',
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
                  padding: '0.5rem 1rem',
                  background: '#4b5563',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.875rem',
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
