'use client';

import React, { useState, useEffect } from 'react';
import { orderApiClient } from '../../services/order-api-client';
import { Order } from '../../../shared/types/entities.types';
import { OrderStatus } from '../../../shared/enums/order.enum';

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

  const isOrderExpired = (o: Order) =>
    o.status === OrderStatus.EXPIRED ||
    (o.status === OrderStatus.PENDING && new Date(o.expires_at).getTime() <= Date.now());

  const filteredOrders = orders.filter((o) => {
    if (statusFilter === 'ALL') return true;
    if (statusFilter === OrderStatus.EXPIRED) {
      return isOrderExpired(o) || o.status === OrderStatus.CANCELLED;
    }
    if (statusFilter === OrderStatus.PENDING) {
      return o.status === OrderStatus.PENDING && !isOrderExpired(o);
    }
    return o.status === statusFilter;
  });

  const getStatusBadge = (order: Order) => {
    if (isOrderExpired(order)) {
      return { label: 'Expired', bg: '#fee2e2', text: '#991b1b' };
    }
    switch (order.status) {
      case OrderStatus.PENDING:
        return { label: 'Payment Left', bg: '#fef3c7', text: '#92400e' };
      case OrderStatus.CONFIRMED:
        return { label: 'Payment done', bg: '#dcfce7', text: '#166534' };
      case OrderStatus.PREPARING:
        return { label: 'Preparing', bg: '#fef08a', text: '#854d0e' };
      case OrderStatus.READY:
        return { label: 'Ready', bg: '#dbeafe', text: '#1e40af' };
      case OrderStatus.COMPLETED:
        return { label: 'Collected', bg: '#fce7f3', text: '#9d174d' };
      case OrderStatus.CANCELLED:
        return { label: 'Cancelled', bg: '#fee2e2', text: '#991b1b' };
      default:
        return { label: order.status, bg: '#fff1f4', text: '#6f5569' };
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
        {[
          { id: 'ALL', label: 'All Orders' },
          { id: OrderStatus.PENDING, label: 'Payment Left' },
          { id: OrderStatus.CONFIRMED, label: 'Payment done' },
          { id: OrderStatus.PREPARING, label: 'Preparing' },
          { id: OrderStatus.READY, label: 'Ready' },
          { id: OrderStatus.COMPLETED, label: 'Collected' },
          { id: OrderStatus.EXPIRED, label: 'Expired' },
        ].map((tab) => {
          const count =
            tab.id === 'ALL'
              ? orders.length
              : tab.id === OrderStatus.EXPIRED
              ? orders.filter(
                  (o) => isOrderExpired(o) || o.status === OrderStatus.CANCELLED
                ).length
              : tab.id === OrderStatus.PENDING
              ? orders.filter((o) => o.status === OrderStatus.PENDING && !isOrderExpired(o)).length
              : orders.filter((o) => o.status === tab.id).length;

          return (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              style={{
                padding: '0.45rem 1rem',
                borderRadius: '9999px',
                border: statusFilter === tab.id ? 'none' : '1px solid #f4d3dd',
                background: statusFilter === tab.id ? '#d61c5d' : '#ffffff',
                color: statusFilter === tab.id ? '#ffffff' : '#2b1233',
                fontSize: '0.8125rem',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: statusFilter === tab.id ? '0 3px 0 #a3134a' : '0 2px 8px -4px rgba(120,20,60,0.08)',
                transition: 'all 0.15s ease',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                whiteSpace: 'nowrap',
              }}
            >
              <span>{tab.label}</span>
              {count > 0 && (
                <span
                  style={{
                    padding: '0.1rem 0.45rem',
                    borderRadius: '9999px',
                    fontSize: '0.7rem',
                    fontWeight: 900,
                    background: statusFilter === tab.id ? 'rgba(255,255,255,0.25)' : '#fff1f4',
                    color: statusFilter === tab.id ? '#ffffff' : '#d61c5d',
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
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
            const statusBadge = getStatusBadge(order);

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
