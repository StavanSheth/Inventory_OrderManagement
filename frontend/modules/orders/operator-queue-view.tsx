'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { orderApiClient } from '../../services/order-api-client';
import { realtimeClient } from '../../services/realtime-client';
import { Order, OrderItem, Payment } from '../../../shared/types/entities.types';
import { OrderStatus, PaymentStatus } from '../../../shared/enums/order.enum';
import { ReceptionPaymentDialog } from './reception-payment-dialog';
import { OperatorOrderEditor } from './operator-order-editor';
import { OrderDetailModal } from './order-detail-modal';
import { isOrderEditable } from '../../../shared/business-rules/order-rules';

interface OperatorQueueViewProps {
  branchId: string;
}

export const OperatorQueueView: React.FC<OperatorQueueViewProps> = ({ branchId }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('ALL');

  // Modal states
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [paymentModalData, setPaymentModalData] = useState<{ order: Order; payments: Payment[] } | null>(null);
  const [editModalData, setEditModalData] = useState<{
    order: Order;
    items: OrderItem[];
    payments: Payment[];
  } | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await orderApiClient.listBranchOrders(branchId, undefined, 100);
      if (res.success) {
        setOrders(res.data);
      } else {
        setError(res.error.message || 'Failed to load branch orders');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Subscribe to real-time events for this branch
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    realtimeClient
      .subscribe({
        branchId,
        onEvent: (event) => {
          // Refresh list or update in place when orders update
          if (
            event.type === 'OrderStatusChanged' ||
            event.type === 'PaymentUpdated' ||
            event.type === 'OrderUpdated'
          ) {
            fetchOrders();
          }
        },
        onError: (err) => {
          console.warn('Realtime branch stream warning:', err);
        },
      })
      .then((unsub) => {
        unsubscribe = unsub;
      });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [branchId, fetchOrders]);

  const handleOpenPayment = async (order: Order) => {
    try {
      const res = await orderApiClient.getBranchOrderDetail(branchId, order.id);
      if (res.success) {
        setPaymentModalData({
          order: res.data.order,
          payments: res.data.payments,
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenEdit = async (order: Order) => {
    try {
      const res = await orderApiClient.getBranchOrderDetail(branchId, order.id);
      if (res.success) {
        setEditModalData({
          order: res.data.order,
          items: res.data.items,
          payments: res.data.payments,
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredOrders = orders.filter((o) => {
    if (activeTab === 'ALL') return true;
    if (activeTab === 'PAYMENT_RECORDED') return o.payment_status === PaymentStatus.RECORDED;
    return o.status === activeTab;
  });

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case OrderStatus.PENDING:
        return { label: 'Pending', bg: '#fef3c7', text: '#92400e' };
      case OrderStatus.CONFIRMED:
        return { label: 'Confirmed', bg: '#dcfce7', text: '#15803d' };
      case OrderStatus.PREPARING:
        return { label: 'Preparing', bg: '#fef9c3', text: '#854d0e' };
      case OrderStatus.READY:
        return { label: 'Ready', bg: '#d1fae5', text: '#065f46' };
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

  const tabs = [
    { id: 'ALL', label: 'All Orders' },
    { id: OrderStatus.PENDING, label: 'Pending' },
    { id: 'PAYMENT_RECORDED', label: 'Payment Recorded' },
    { id: OrderStatus.CONFIRMED, label: 'Confirmed' },
    { id: OrderStatus.PREPARING, label: 'Preparing' },
    { id: OrderStatus.READY, label: 'Ready' },
    { id: OrderStatus.COMPLETED, label: 'Completed' },
    { id: OrderStatus.EXPIRED, label: 'Expired' },
  ];

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 0.25rem 0', color: '#111827' }}>
            Branch Order Queue
          </h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>
            Realtime reception & fulfillment order management (Branch: {branchId})
          </p>
        </div>
        <button
          onClick={fetchOrders}
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
          Refresh Queue
        </button>
      </div>

      {/* Tabs */}
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
        {tabs.map((tab) => {
          const count = tab.id === 'ALL' ? orders.length : orders.filter((o) => o.status === tab.id).length;
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '0.5rem 0.85rem',
                borderRadius: '8px',
                border: 'none',
                background: isSelected ? '#1e293b' : '#f3f4f6',
                color: isSelected ? '#ffffff' : '#4b5563',
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                whiteSpace: 'nowrap',
              }}
            >
              <span>{tab.label}</span>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '0.1rem 0.4rem',
                  borderRadius: '9999px',
                  background: isSelected ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)',
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Error Notice */}
      {error && (
        <div
          style={{
            padding: '1rem',
            background: '#fee2e2',
            border: '1px solid #f87171',
            borderRadius: '6px',
            color: '#b91c1c',
            marginBottom: '1.25rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>
          Loading order queue...
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredOrders.length === 0 && (
        <div
          style={{
            padding: '3rem',
            textAlign: 'center',
            background: '#f9fafb',
            borderRadius: '8px',
            border: '1px dashed #d1d5db',
            color: '#6b7280',
          }}
        >
          No orders in this state.
        </div>
      )}

      {/* Orders Grid */}
      {!loading && filteredOrders.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: '1rem',
          }}
        >
          {filteredOrders.map((order) => {
            const badge = getStatusBadge(order.status);
            const isPending = order.status === OrderStatus.PENDING;
            const canEdit = isOrderEditable(order, 60);

            return (
              <div
                key={order.id}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  padding: '1.25rem',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#111827' }}>
                        {order.order_number}
                      </div>
                      <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                        {new Date(order.placed_at).toLocaleTimeString()} &bull; ID: {order.id.slice(0, 8)}...
                      </div>
                    </div>
                    <span
                      style={{
                        padding: '0.25rem 0.6rem',
                        borderRadius: '9999px',
                        background: badge.bg,
                        color: badge.text,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                      }}
                    >
                      {badge.label}
                    </span>
                  </div>

                  <div style={{ background: '#f9fafb', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.8125rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <span style={{ color: '#6b7280' }}>Payment:</span>
                      <span style={{ fontWeight: 600, color: order.payment_status === PaymentStatus.VERIFIED ? '#16a34a' : '#d97706' }}>
                        {order.payment_status}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#6b7280' }}>Total:</span>
                      <span style={{ fontWeight: 800, fontSize: '1rem', color: '#111827' }}>
                        ₹{order.total.toFixed(2)}
                      </span>
                    </div>
                    {isPending && (
                      <div style={{ marginTop: '0.35rem', color: '#dc2626', fontSize: '0.75rem' }}>
                        Expires at: {new Date(order.expires_at).toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setSelectedOrderId(order.id)}
                    style={{
                      flex: 1,
                      padding: '0.45rem',
                      background: '#f3f4f6',
                      color: '#1f2937',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    View Detail
                  </button>

                  <button
                    onClick={() => handleOpenPayment(order)}
                    style={{
                      flex: 1,
                      padding: '0.45rem',
                      background: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Payment
                  </button>

                  {canEdit && (
                    <button
                      onClick={() => handleOpenEdit(order)}
                      style={{
                        padding: '0.45rem 0.75rem',
                        background: '#ffffff',
                        color: '#374151',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {selectedOrderId && (
        <OrderDetailModal
          branchId={branchId}
          orderId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
          onOpenPayment={(ord, pays) => {
            setSelectedOrderId(null);
            setPaymentModalData({ order: ord, payments: pays });
          }}
          onOpenEdit={(ord, itms, pays) => {
            setSelectedOrderId(null);
            setEditModalData({ order: ord, items: itms, payments: pays });
          }}
          onStatusChanged={fetchOrders}
        />
      )}

      {paymentModalData && (
        <ReceptionPaymentDialog
          branchId={branchId}
          order={paymentModalData.order}
          payments={paymentModalData.payments}
          onClose={() => setPaymentModalData(null)}
          onSuccess={fetchOrders}
        />
      )}

      {editModalData && (
        <OperatorOrderEditor
          branchId={branchId}
          order={editModalData.order}
          initialItems={editModalData.items}
          payments={editModalData.payments}
          onClose={() => setEditModalData(null)}
          onSuccess={fetchOrders}
        />
      )}
    </div>
  );
};
