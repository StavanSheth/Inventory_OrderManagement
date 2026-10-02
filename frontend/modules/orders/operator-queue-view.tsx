'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { orderApiClient } from '../../services/order-api-client';
import { realtimeClient } from '../../services/realtime-client';
import { Order, OrderItem, Payment } from '../../../shared/types/entities.types';
import { OrderStatus, PaymentStatus, PaymentMethod } from '../../../shared/enums/order.enum';
import { ReceptionPaymentDialog } from './reception-payment-dialog';
import { OperatorOrderEditor } from './operator-order-editor';

interface OperatorQueueViewProps {
  branchId: string;
}

const WORKFLOW_STAGES: {
  key: 'CONFIRMED' | 'PREPARING' | 'READY' | 'COMPLETED';
  label: string;
  targetStatus: OrderStatus;
  icon: string;
}[] = [
  { key: 'CONFIRMED', label: '1. Payment done', targetStatus: OrderStatus.CONFIRMED, icon: '💳' },
  { key: 'PREPARING', label: '2. Preparing', targetStatus: OrderStatus.PREPARING, icon: '🍳' },
  { key: 'READY', label: '3. Ready', targetStatus: OrderStatus.READY, icon: '🍦' },
  { key: 'COMPLETED', label: '4. Collected', targetStatus: OrderStatus.COMPLETED, icon: '🛍️' },
];

export const OperatorQueueView: React.FC<OperatorQueueViewProps> = ({ branchId }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [advancingOrderId, setAdvancingOrderId] = useState<string | null>(null);

  // Modal states
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

  // Move order through its lifecycle stages
  const handleAdvanceStage = async (order: Order, targetStatus: OrderStatus) => {
    if (advancingOrderId) return;
    setAdvancingOrderId(order.id);
    setError(null);

    try {
      if (targetStatus === OrderStatus.CONFIRMED) {
        // If payment is pending at reception, record and verify cash atomically
        if (
          order.payment_status !== PaymentStatus.VERIFIED &&
          order.payment_status !== PaymentStatus.COMPLETED
        ) {
          const recRes = await orderApiClient.recordPayment(branchId, order.id, {
            method: PaymentMethod.CASH,
            amount: order.total,
            notes: 'Counter reception payment',
          });

          if (recRes.success) {
            await orderApiClient.verifyPayment(
              branchId,
              order.id,
              recRes.data.payment.id,
              'Counter verified'
            );
          }
        }

        const res = await orderApiClient.confirmOrder(branchId, order.id);
        if (res.success) {
          setOrders((prev) =>
            prev.map((o) =>
              o.id === order.id
                ? { ...o, status: OrderStatus.CONFIRMED, payment_status: PaymentStatus.VERIFIED }
                : o
            )
          );
          await fetchOrders();
        } else {
          setError(res.error.message || 'Failed to confirm order');
        }
      } else if (
        targetStatus === OrderStatus.PREPARING ||
        targetStatus === OrderStatus.READY ||
        targetStatus === OrderStatus.COMPLETED
      ) {
        const res = await orderApiClient.updateOrderStatus(branchId, order.id, targetStatus);
        if (res.success) {
          setOrders((prev) =>
            prev.map((o) => (o.id === order.id ? { ...o, status: targetStatus } : o))
          );
          await fetchOrders();
        } else {
          setError(res.error.message || `Failed to transition order to ${targetStatus}`);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error during stage transition');
    } finally {
      setAdvancingOrderId(null);
    }
  };

  // Tabs: removed 'Pending' as requested by user
  const tabs = [
    { id: 'ALL', label: 'All Orders' },
    { id: OrderStatus.CONFIRMED, label: 'Payment done' },
    { id: OrderStatus.PREPARING, label: 'Preparing' },
    { id: OrderStatus.READY, label: 'Ready' },
    { id: OrderStatus.COMPLETED, label: 'Collected / All done' },
    { id: OrderStatus.EXPIRED, label: 'Expired' },
  ];

  const getTabCount = (tabId: string) => {
    if (tabId === 'ALL') return orders.length;
    if (tabId === OrderStatus.EXPIRED) {
      return orders.filter(
        (o) => o.status === OrderStatus.EXPIRED || o.status === OrderStatus.CANCELLED
      ).length;
    }
    return orders.filter((o) => o.status === tabId).length;
  };

  const filteredOrders = orders.filter((o) => {
    if (activeTab === 'ALL') return true;
    if (activeTab === OrderStatus.EXPIRED) {
      return o.status === OrderStatus.EXPIRED || o.status === OrderStatus.CANCELLED;
    }
    return o.status === activeTab;
  });

  // Sort: Latest orders on top, Expired/Cancelled at bottom
  const sortedOrders = [...filteredOrders].sort((a, b) => {
    const aTerminal = a.status === OrderStatus.EXPIRED || a.status === OrderStatus.CANCELLED;
    const bTerminal = b.status === OrderStatus.EXPIRED || b.status === OrderStatus.CANCELLED;
    if (aTerminal && !bTerminal) return 1;
    if (!aTerminal && bTerminal) return -1;
    return new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime();
  });

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case OrderStatus.PENDING:
        return { label: 'Pending', bg: '#ffcf4d', text: '#2b1233' };
      case OrderStatus.CONFIRMED:
        return { label: 'Payment done', bg: '#dcfce7', text: '#166534' };
      case OrderStatus.PREPARING:
        return { label: 'Preparing', bg: '#fef08a', text: '#854d0e' };
      case OrderStatus.READY:
        return { label: 'Ready', bg: '#dbeafe', text: '#1e40af' };
      case OrderStatus.COMPLETED:
        return { label: 'Collected', bg: '#fce7f3', text: '#9d174d' };
      case OrderStatus.EXPIRED:
        return { label: 'Expired', bg: '#fee2e2', text: '#991b1b' };
      case OrderStatus.CANCELLED:
        return { label: 'Cancelled', bg: '#fee2e2', text: '#991b1b' };
      default:
        return { label: status, bg: '#fff1f4', text: '#6f5569' };
    }
  };

  const getStageState = (
    orderStatus: OrderStatus,
    stageKey: 'CONFIRMED' | 'PREPARING' | 'READY' | 'COMPLETED'
  ): 'done' | 'active' | 'upcoming' => {
    const sequence = [
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.PREPARING,
      OrderStatus.READY,
      OrderStatus.COMPLETED,
    ];
    const orderIdx = sequence.indexOf(orderStatus);
    const targetStatus = OrderStatus[stageKey];
    const stageTargetIdx = sequence.indexOf(targetStatus);

    if (orderIdx >= stageTargetIdx) {
      return 'done';
    }
    if (orderIdx === stageTargetIdx - 1) {
      return 'active';
    }
    return 'upcoming';
  };

  return (
    <div
      style={{
        maxWidth: '1240px',
        margin: '0 auto',
        padding: '1rem 0',
        fontFamily: 'var(--font-body-family), system-ui, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-display-family)',
              fontSize: '2rem',
              fontWeight: 700,
              margin: '0 0 0.25rem 0',
              color: '#2b1233',
            }}
          >
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
          const count = getTabCount(tab.id);
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
            border: '1px solid #f87171',
            borderRadius: '1rem',
            color: '#b91c1c',
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
      {!loading && sortedOrders.length === 0 && (
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

      {/* Orders Grid - Sorted with latest on top, expired on bottom */}
      {!loading && sortedOrders.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))',
            gap: '1.25rem',
          }}
        >
          {sortedOrders.map((order) => {
            const badge = getStatusBadge(order.status);
            const isPending = order.status === OrderStatus.PENDING;
            const isConfirmed = order.status === OrderStatus.CONFIRMED;
            const isCompleted = order.status === OrderStatus.COMPLETED;
            const isTerminalExpired =
              order.status === OrderStatus.EXPIRED || order.status === OrderStatus.CANCELLED;
            const isAdvancing = advancingOrderId === order.id;
            const isPaymentVerified =
              order.payment_status === PaymentStatus.VERIFIED ||
              order.payment_status === PaymentStatus.COMPLETED;

            return (
              <div
                key={order.id}
                style={{
                  background: '#ffffff',
                  border: isConfirmed ? '1.5px solid #86efac' : '1px solid #f4d3dd',
                  borderRadius: '1.5rem',
                  padding: '1.5rem',
                  boxShadow: '0 8px 24px -12px rgba(120, 20, 60, 0.12)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  transition: 'all 0.15s ease',
                  opacity: isTerminalExpired ? 0.75 : 1,
                }}
              >
                <div>
                  {/* Order Card Header */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '0.75rem',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontFamily: 'var(--font-display-family)',
                          fontWeight: 700,
                          fontSize: '1.2rem',
                          color: '#2b1233',
                        }}
                      >
                        {order.order_number}
                      </div>
                      <div style={{ color: '#6f5569', fontSize: '0.75rem', fontWeight: 600 }}>
                        {new Date(order.placed_at).toLocaleTimeString()} &bull; ID: {order.id.slice(0, 8)}...
                      </div>
                    </div>
                    {/* Right Top Status Tag (Properly synced) */}
                    <span
                      style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: '9999px',
                        background: badge.bg,
                        color: badge.text,
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        border: '1px solid rgba(0,0,0,0.05)',
                      }}
                    >
                      {badge.label}
                    </span>
                  </div>

                  {/* Order Summary Box */}
                  <div
                    style={{
                      background: '#fff1f4',
                      padding: '0.75rem 1rem',
                      borderRadius: '1rem',
                      marginBottom: '0.75rem',
                      fontSize: '0.8125rem',
                      border: '1px solid #f4d3dd',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: '0.35rem',
                      }}
                    >
                      <span style={{ color: '#6f5569', fontWeight: 600 }}>Payment:</span>
                      <span
                        style={{
                          fontWeight: 800,
                          color: isPaymentVerified ? '#166534' : '#d61c5d',
                        }}
                      >
                        {order.payment_status}
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ color: '#6f5569', fontWeight: 600 }}>Total:</span>
                      <span
                        style={{
                          fontFamily: 'var(--font-display-family)',
                          fontWeight: 800,
                          fontSize: '1.15rem',
                          color: '#d61c5d',
                        }}
                      >
                        ₹{order.total.toFixed(2)}
                      </span>
                    </div>
                    {isPending && (
                      <div
                        style={{
                          marginTop: '0.35rem',
                          color: '#d61c5d',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                        }}
                      >
                        Expires at: {new Date(order.expires_at).toLocaleTimeString()}
                      </div>
                    )}
                  </div>

                  {/* Order Details / Items Visible Directly on Card */}
                  {order.items && order.items.length > 0 && (
                    <div
                      style={{
                        background: '#ffffff',
                        border: '1px solid #f4d3dd',
                        borderRadius: '0.85rem',
                        padding: '0.75rem',
                        marginBottom: '0.85rem',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '0.6875rem',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          color: '#6f5569',
                          marginBottom: '0.35rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>Order Items ({order.items.reduce((sum, it) => sum + it.quantity, 0)})</span>
                        <span>₹{order.total.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        {order.items.map((it) => (
                          <div
                            key={it.id}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              fontSize: '0.78rem',
                            }}
                          >
                            <span style={{ fontWeight: 700, color: '#2b1233' }}>
                              🍦 {it.product_name_snapshot}{' '}
                              <span style={{ color: '#d61c5d', fontWeight: 800 }}>×{it.quantity}</span>
                            </span>
                            <span style={{ fontWeight: 800, color: '#6f5569' }}>
                              ₹{it.line_total.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Stage Buttons Workflow Section */}
                  <div style={{ marginBottom: '0.5rem' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.6875rem',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: '#6f5569',
                        marginBottom: '0.45rem',
                      }}
                    >
                      <span>Order Stages</span>
                      <span>
                        {isCompleted
                          ? '✓ Fulfilled'
                          : isTerminalExpired
                          ? 'Voided'
                          : 'Click stage to move'}
                      </span>
                    </div>

                    {/* Expired / Cancelled Banner */}
                    {isTerminalExpired ? (
                      <div
                        style={{
                          padding: '0.65rem 0.85rem',
                          background: '#fee2e2',
                          border: '1px solid #fca5a5',
                          borderRadius: '0.85rem',
                          textAlign: 'center',
                          color: '#991b1b',
                          fontWeight: 800,
                          fontSize: '0.75rem',
                        }}
                      >
                        {order.status === OrderStatus.EXPIRED ? '⚠️ Expired Order' : '🚫 Cancelled Order'}
                      </div>
                    ) : (
                      /* 4-Stage Interactive Buttons */
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(2, 1fr)',
                          gap: '0.45rem',
                        }}
                      >
                        {WORKFLOW_STAGES.map((st) => {
                          const state = getStageState(order.status, st.key);
                          const isDone = state === 'done';
                          const isActive = state === 'active';
                          const isButtonPendingAdvancing = isAdvancing && isActive;

                          // When payment done is clicked, preparing button becomes YELLOW
                          const isPreparingYellow = st.key === 'PREPARING' && isActive;

                          if (isDone) {
                            return (
                              <button
                                key={st.key}
                                type="button"
                                disabled
                                style={{
                                  padding: '0.5rem',
                                  background: '#dcfce7',
                                  border: '1px solid #86efac',
                                  borderRadius: '0.75rem',
                                  color: '#166534',
                                  fontSize: '0.75rem',
                                  fontWeight: 800,
                                  cursor: 'default',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '0.25rem',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                <span>✓</span>
                                <span>{st.label}</span>
                              </button>
                            );
                          }

                          if (isActive) {
                            return (
                              <button
                                key={st.key}
                                type="button"
                                disabled={isAdvancing}
                                onClick={() => handleAdvanceStage(order, st.targetStatus)}
                                title={`Advance order to ${st.label}`}
                                style={{
                                  padding: '0.5rem',
                                  background: isPreparingYellow
                                    ? '#facc15'
                                    : st.key === 'READY'
                                    ? '#2563eb'
                                    : st.key === 'COMPLETED'
                                    ? '#059669'
                                    : '#d61c5d',
                                  border: isPreparingYellow ? '1.5px solid #eab308' : 'none',
                                  borderRadius: '0.75rem',
                                  color: isPreparingYellow ? '#713f12' : '#ffffff',
                                  fontSize: '0.75rem',
                                  fontWeight: 900,
                                  cursor: isAdvancing ? 'wait' : 'pointer',
                                  boxShadow: isPreparingYellow
                                    ? '0 3px 0 #ca8a04'
                                    : st.key === 'READY'
                                    ? '0 3px 0 #1d4ed8'
                                    : st.key === 'COMPLETED'
                                    ? '0 3px 0 #047857'
                                    : '0 3px 0 #a3134a',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '0.25rem',
                                  whiteSpace: 'nowrap',
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                <span>{isButtonPendingAdvancing ? '⏳' : st.icon}</span>
                                <span>
                                  {isButtonPendingAdvancing
                                    ? 'Updating...'
                                    : `${st.label} →`}
                                </span>
                              </button>
                            );
                          }

                          // Upcoming stage
                          return (
                            <button
                              key={st.key}
                              type="button"
                              disabled
                              style={{
                                padding: '0.5rem',
                                background: '#fcf8fa',
                                border: '1px dashed #eedbe3',
                                borderRadius: '0.75rem',
                                color: '#9d8695',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                cursor: 'not-allowed',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.25rem',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <span>{st.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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
