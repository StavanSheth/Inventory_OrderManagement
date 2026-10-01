'use client';

import React, { useState, useEffect } from 'react';
import { orderApiClient } from '../../services/order-api-client';
import { Order } from '../../../shared/types/entities.types';
import { OrderStatus, PaymentStatus } from '../../../shared/enums/order.enum';

interface OrderHistoryViewProps {
  onSelectOrder: (orderId: string) => void;
  onBackToCatalog?: () => void;
}

export const OrderHistoryView: React.FC<OrderHistoryViewProps> = ({
  onSelectOrder,
  onBackToCatalog,
}) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await orderApiClient.listCustomerOrders(100);
      if (res.success) {
        setOrders(res.data);
      } else {
        setError(res.error.message || 'Failed to load order history');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const filteredOrders = orders.filter((o) => {
    if (statusFilter === 'ALL') return true;
    return o.status === statusFilter;
  });

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case OrderStatus.PENDING:
        return { label: 'Pending Payment', bg: '#fef3c7', text: '#92400e' };
      case OrderStatus.CONFIRMED:
        return { label: 'Confirmed', bg: '#dcfce7', text: '#15803d' };
      case OrderStatus.PREPARING:
        return { label: 'Preparing', bg: '#fef9c3', text: '#854d0e' };
      case OrderStatus.READY:
        return { label: 'Ready for Pickup', bg: '#d1fae5', text: '#065f46' };
      case OrderStatus.COMPLETED:
        return { label: 'Completed', bg: '#f3f4f6', text: '#374151' };
      case OrderStatus.EXPIRED:
        return { label: 'Expired', bg: '#fee2e2', text: '#991b1b' };
      case OrderStatus.CANCELLED:
        return { label: 'Cancelled', bg: '#fee2e2', text: '#b91c1c' };
      default:
        return { label: status, bg: '#f3f4f6', text: '#4b5563' };
    }
  };

  const getPaymentStatusBadge = (status: PaymentStatus) => {
    switch (status) {
      case PaymentStatus.VERIFIED:
        return { label: 'Paid & Verified', bg: '#dcfce7', text: '#166534' };
      case PaymentStatus.RECORDED:
        return { label: 'Payment Recorded', bg: '#e0e7ff', text: '#3730a3' };
      case PaymentStatus.FAILED:
        return { label: 'Payment Failed', bg: '#fee2e2', text: '#991b1b' };
      default:
        return { label: 'Pending Payment', bg: '#fef3c7', text: '#92400e' };
    }
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0 0 0.25rem 0', color: '#111827' }}>
            My Orders
          </h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>
            View and track your previous and active orders
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {onBackToCatalog && (
            <button
              onClick={onBackToCatalog}
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                background: '#ffffff',
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: '0.875rem',
              }}
            >
              Back to Catalog
            </button>
          )}
          <button
            onClick={fetchOrders}
            style={{
              padding: '0.5rem 1rem',
              border: 'none',
              borderRadius: '6px',
              background: '#2563eb',
              color: '#ffffff',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '0.875rem',
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '1px solid #e5e7eb',
          paddingBottom: '0.5rem',
          marginBottom: '1.5rem',
          overflowX: 'auto',
        }}
      >
        {['ALL', OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.READY, OrderStatus.COMPLETED].map((tab) => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            style={{
              padding: '0.375rem 0.75rem',
              borderRadius: '9999px',
              border: 'none',
              background: statusFilter === tab ? '#2563eb' : '#f3f4f6',
              color: statusFilter === tab ? '#ffffff' : '#4b5563',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {tab === 'ALL' ? 'All Orders' : tab.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>
          <div style={{ fontSize: '1.125rem', fontWeight: 500 }}>Loading your orders...</div>
        </div>
      )}

      {error && !loading && (
        <div
          style={{
            padding: '1rem',
            background: '#fee2e2',
            border: '1px solid #f87171',
            borderRadius: '6px',
            color: '#b91c1c',
            marginBottom: '1rem',
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && filteredOrders.length === 0 && (
        <div
          style={{
            padding: '3rem',
            textAlign: 'center',
            background: '#f9fafb',
            borderRadius: '8px',
            border: '1px dashed #d1d5db',
          }}
        >
          <div style={{ fontSize: '1.125rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>
            No orders found
          </div>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            {statusFilter === 'ALL'
              ? "You haven't placed any orders yet."
              : `No orders match the "${statusFilter}" filter.`}
          </p>
          {onBackToCatalog && (
            <button
              onClick={onBackToCatalog}
              style={{
                padding: '0.625rem 1.25rem',
                border: 'none',
                borderRadius: '6px',
                background: '#2563eb',
                color: '#ffffff',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Browse Catalog
            </button>
          )}
        </div>
      )}

      {!loading && !error && filteredOrders.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filteredOrders.map((order) => {
            const statusBadge = getStatusBadge(order.status);
            const paymentBadge = getPaymentStatusBadge(order.payment_status);

            return (
              <div
                key={order.id}
                onClick={() => onSelectOrder(order.id)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1rem 1.25rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  background: '#ffffff',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#93c5fd';
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(37,99,235,0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e5e7eb';
                  e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)';
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.375rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '1rem', color: '#111827' }}>
                      {order.order_number}
                    </span>
                    <span
                      style={{
                        padding: '0.2rem 0.6rem',
                        borderRadius: '9999px',
                        background: statusBadge.bg,
                        color: statusBadge.text,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                      }}
                    >
                      {statusBadge.label}
                    </span>
                    <span
                      style={{
                        padding: '0.2rem 0.6rem',
                        borderRadius: '9999px',
                        background: paymentBadge.bg,
                        color: paymentBadge.text,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                      }}
                    >
                      {paymentBadge.label}
                    </span>
                  </div>
                  <div style={{ color: '#6b7280', fontSize: '0.8125rem' }}>
                    Placed on: {new Date(order.placed_at).toLocaleString()}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827' }}>
                    ₹{order.total.toFixed(2)}
                  </div>
                  <div style={{ color: '#2563eb', fontSize: '0.8125rem', fontWeight: 600, marginTop: '0.25rem' }}>
                    View Details &rarr;
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
