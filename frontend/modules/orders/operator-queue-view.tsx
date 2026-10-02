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
        onConnected: () => {
          fetchOrders();
        },
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
        return { label: 'Pending', bg: '#ffcf4d', text: '#2b1233' };
      case OrderStatus.CONFIRMED:
        return { label: 'Confirmed', bg: '#bfe3a6', text: '#2b1233' };
      case OrderStatus.PREPARING:
        return { label: 'Preparing', bg: '#ecd3b4', text: '#2b1233' };
      case OrderStatus.READY:
        return { label: 'Ready', bg: '#a9bfff', text: '#2b1233' };
      case OrderStatus.COMPLETED:
        return { label: 'Completed', bg: '#ffc2d4', text: '#2b1233' };
      case OrderStatus.EXPIRED:
      case OrderStatus.CANCELLED:
        return { label: 'Cancelled', bg: '#fecdd3', text: '#9f1239' };
      default:
        return { label: status, bg: '#fff1f4', text: '#6f5569' };
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
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem 0', fontFamily: 'var(--font-body-family), system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display-family)', fontSize: '2rem', fontWeight: 700, margin: '0 0 0.25rem 0', color: '#2b1233' }}>
            Branch Order Queue
          </h1>
          <p style={{ margin: 0, color: '#6f5569', fontSize: '0.875rem', fontWeight: 600 }}>
            Realtime reception & fulfillment order management (Branch: {branchId})
          </p>
        </div>
        <button
          onClick={fetchOrders}
          style={{
            padding: '0.55rem 1.35rem',
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
          Refresh Queue
        </button>
      </div>

      {/* Tabs */}
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
        {tabs.map((tab) => {
          const count = tab.id === 'ALL' ? orders.length : orders.filter((o) => o.status === tab.id).length;
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '0.45rem 1rem',
                borderRadius: '9999px',
                border: isSelected ? 'none' : '1px solid #f4d3dd',
                background: isSelected ? '#d61c5d' : '#ffffff',
                color: isSelected ? '#ffffff' : '#2b1233',
                fontSize: '0.8125rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                whiteSpace: 'nowrap',
                boxShadow: isSelected ? '0 3px 0 #a3134a' : '0 2px 8px -4px rgba(120,20,60,0.08)',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{tab.label}</span>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '0.1rem 0.45rem',
                  borderRadius: '9999px',
                  background: isSelected ? 'rgba(255,255,255,0.25)' : '#fff1f4',
                  color: isSelected ? '#ffffff' : '#2b1233',
                  fontWeight: 900,
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
            padding: '1rem 1.25rem',
            background: '#ffffff',
            border: '1px solid #f4d3dd',
            borderRadius: '1rem',
            color: '#d61c5d',
            marginBottom: '1.25rem',
            fontWeight: 700,
          }}
        >
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#6f5569', fontWeight: 700 }}>
          Loading order queue...
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredOrders.length === 0 && (
        <div
          style={{
            padding: '3rem',
            textAlign: 'center',
            background: '#ffffff',
            borderRadius: '1.5rem',
            border: '1px dashed #f4d3dd',
            color: '#6f5569',
            fontWeight: 700,
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
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
            gap: '1.25rem',
          }}
        >
          {filteredOrders.map((order) => {
            const badge = getStatusBadge(order.status);
            const isPending = order.status === OrderStatus.PENDING;
            const canEdit = isOrderEditable(order);

            return (
              <div
                key={order.id}
                style={{
                  background: '#ffffff',
                  border: '1px solid #f4d3dd',
                  borderRadius: '1.5rem',
                  padding: '1.5rem',
                  boxShadow: '0 8px 24px -12px rgba(120, 20, 60, 0.12)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  transition: 'all 0.15s ease',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-display-family)', fontWeight: 700, fontSize: '1.2rem', color: '#2b1233' }}>
                        {order.order_number}
                      </div>
                      <div style={{ color: '#6f5569', fontSize: '0.75rem', fontWeight: 600 }}>
                        {new Date(order.placed_at).toLocaleTimeString()} &bull; ID: {order.id.slice(0, 8)}...
                      </div>
                    </div>
                    <span
                      style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: '9999px',
                        background: badge.bg,
                        color: badge.text,
                        fontSize: '0.75rem',
                        fontWeight: 800,
                      }}
                    >
                      {badge.label}
                    </span>
                  </div>

                  <div style={{ background: '#fff1f4', padding: '0.85rem 1rem', borderRadius: '1rem', marginBottom: '1.25rem', fontSize: '0.8125rem', border: '1px solid #f4d3dd' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                      <span style={{ color: '#6f5569', fontWeight: 600 }}>Payment:</span>
                      <span style={{ fontWeight: 800, color: order.payment_status === PaymentStatus.VERIFIED ? '#2b1233' : '#d61c5d' }}>
                        {order.payment_status}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#6f5569', fontWeight: 600 }}>Total:</span>
                      <span style={{ fontFamily: 'var(--font-display-family)', fontWeight: 800, fontSize: '1.15rem', color: '#d61c5d' }}>
                        ₹{order.total.toFixed(2)}
                      </span>
                    </div>
                    {isPending && (
                      <div style={{ marginTop: '0.45rem', color: '#d61c5d', fontSize: '0.75rem', fontWeight: 700 }}>
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
                      padding: '0.5rem',
                      background: '#fff1f4',
                      color: '#2b1233',
                      border: '1px solid #f4d3dd',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    View Detail
                  </button>

                  <button
                    onClick={() => handleOpenPayment(order)}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      background: '#d61c5d',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      boxShadow: '0 3px 0 #a3134a',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    Payment
                  </button>

                  {canEdit && (
                    <button
                      onClick={() => handleOpenEdit(order)}
                      style={{
                        padding: '0.5rem 0.9rem',
                        background: '#ffffff',
                        color: '#2b1233',
                        border: '1px solid #f4d3dd',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
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
