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
        return { label: 'Pending Payment', bg: '#ffcf4d', text: '#2b1233' };
      case OrderStatus.CONFIRMED:
        return { label: 'Confirmed', bg: '#bfe3a6', text: '#2b1233' };
      case OrderStatus.PREPARING:
        return { label: 'Preparing', bg: '#ecd3b4', text: '#2b1233' };
      case OrderStatus.READY:
        return { label: 'Ready for Pickup', bg: '#a9bfff', text: '#2b1233' };
      case OrderStatus.COMPLETED:
        return { label: 'Completed', bg: '#ffc2d4', text: '#2b1233' };
      case OrderStatus.EXPIRED:
      case OrderStatus.CANCELLED:
        return { label: 'Cancelled', bg: '#fecdd3', text: '#9f1239' };
      default:
        return { label: status, bg: '#fff1f4', text: '#6f5569' };
    }
  };

  const getPaymentStatusBadge = (status: PaymentStatus) => {
    switch (status) {
      case PaymentStatus.VERIFIED:
        return { label: 'Paid & Verified', bg: '#bfe3a6', text: '#2b1233' };
      case PaymentStatus.RECORDED:
        return { label: 'Payment Recorded', bg: '#a9bfff', text: '#2b1233' };
      case PaymentStatus.FAILED:
        return { label: 'Payment Failed', bg: '#fecdd3', text: '#9f1239' };
      default:
        return { label: 'Pending Payment', bg: '#ffcf4d', text: '#2b1233' };
    }
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem', fontFamily: 'var(--font-body-family), system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display-family)', fontSize: '2rem', fontWeight: 700, margin: '0 0 0.25rem 0', color: '#2b1233' }}>
            My Orders
          </h1>
          <p style={{ margin: 0, color: '#6f5569', fontSize: '0.875rem', fontWeight: 600 }}>
            View and track your previous and active orders
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {onBackToCatalog && (
            <button
              onClick={onBackToCatalog}
              style={{
                padding: '0.5rem 1.1rem',
                border: '1px solid #f4d3dd',
                borderRadius: '9999px',
                background: '#ffffff',
                color: '#2b1233',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.8125rem',
                boxShadow: '0 2px 8px -4px rgba(120,20,60,0.1)',
              }}
            >
              Back to Counter
            </button>
          )}
          <button
            onClick={fetchOrders}
            style={{
              padding: '0.5rem 1.25rem',
              border: 'none',
              borderRadius: '9999px',
              background: '#d61c5d',
              color: '#ffffff',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: '0.8125rem',
              boxShadow: '0 3px 0 #a3134a',
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
          borderBottom: '1px solid #f4d3dd',
          paddingBottom: '0.75rem',
          marginBottom: '1.5rem',
          overflowX: 'auto',
        }}
      >
        {['ALL', OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.READY, OrderStatus.COMPLETED].map((tab) => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            style={{
              padding: '0.45rem 1rem',
              borderRadius: '9999px',
              border: statusFilter === tab ? 'none' : '1px solid #f4d3dd',
              background: statusFilter === tab ? '#d61c5d' : '#ffffff',
              color: statusFilter === tab ? '#ffffff' : '#2b1233',
              fontSize: '0.8125rem',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: statusFilter === tab ? '0 3px 0 #a3134a' : '0 2px 8px -4px rgba(120,20,60,0.08)',
              transition: 'all 0.15s ease',
            }}
          >
            {tab === 'ALL' ? 'All Orders' : tab.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#6f5569' }}>
          <div style={{ fontSize: '1rem', fontWeight: 700 }}>Loading your scoops...</div>
        </div>
      )}

      {error && !loading && (
        <div
          style={{
            padding: '1rem 1.25rem',
            background: '#ffffff',
            border: '1px solid #f4d3dd',
            borderRadius: '1rem',
            color: '#d61c5d',
            marginBottom: '1rem',
            fontWeight: 700,
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
            background: '#ffffff',
            borderRadius: '1.5rem',
            border: '1px dashed #f4d3dd',
          }}
        >
          <div style={{ fontFamily: 'var(--font-display-family)', fontSize: '1.25rem', fontWeight: 700, color: '#2b1233', marginBottom: '0.5rem' }}>
            No orders found
          </div>
          <p style={{ color: '#6f5569', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            {statusFilter === 'ALL'
              ? "You haven't placed any orders yet."
              : `No orders match the "${statusFilter}" filter.`}
          </p>
          {onBackToCatalog && (
            <button
              onClick={onBackToCatalog}
              style={{
                padding: '0.65rem 1.5rem',
                border: 'none',
                borderRadius: '9999px',
                background: '#d61c5d',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '0.875rem',
                cursor: 'pointer',
                boxShadow: '0 4px 0 #a3134a',
              }}
            >
              Browse Scoops
            </button>
          )}
        </div>
      )}

      {!loading && !error && filteredOrders.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
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
                  padding: '1.25rem 1.5rem',
                  border: '1px solid #f4d3dd',
                  borderRadius: '1.25rem',
                  background: '#ffffff',
                  boxShadow: '0 8px 24px -12px rgba(120, 20, 60, 0.12)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#d61c5d';
                  e.currentTarget.style.boxShadow = '0 12px 32px -12px rgba(120,20,60,0.22)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#f4d3dd';
                  e.currentTarget.style.boxShadow = '0 8px 24px -12px rgba(120, 20, 60, 0.12)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem' }}>
                    <span style={{ fontFamily: 'var(--font-display-family)', fontWeight: 700, fontSize: '1.15rem', color: '#2b1233' }}>
                      {order.order_number}
                    </span>
                    <span
                      style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: '9999px',
                        background: statusBadge.bg,
                        color: statusBadge.text,
                        fontSize: '0.75rem',
                        fontWeight: 800,
                      }}
                    >
                      {statusBadge.label}
                    </span>
                    <span
                      style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: '9999px',
                        background: paymentBadge.bg,
                        color: paymentBadge.text,
                        fontSize: '0.75rem',
                        fontWeight: 800,
                      }}
                    >
                      {paymentBadge.label}
                    </span>
                  </div>
                  <div style={{ color: '#6f5569', fontSize: '0.8125rem', fontWeight: 600 }}>
                    Placed on: {new Date(order.placed_at).toLocaleString()}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-display-family)', fontSize: '1.25rem', fontWeight: 700, color: '#d61c5d' }}>
                    ₹{order.total.toFixed(2)}
                  </div>
                  <div style={{ color: '#2b1233', fontSize: '0.8125rem', fontWeight: 800, marginTop: '0.25rem' }}>
                    View Scoop &rarr;
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
