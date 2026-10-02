'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { orderApiClient, CatalogCategory } from '../../services/order-api-client';
import { realtimeClient } from '../../services/realtime-client';
import { Order, OrderItem, Payment, Product } from '../../../shared/types/entities.types';
import { OrderStatus, PaymentStatus, PaymentMethod } from '../../../shared/enums/order.enum';
import { ReceptionPaymentDialog } from './reception-payment-dialog';
import { OperatorOrderEditor } from './operator-order-editor';

interface OperatorQueueViewProps {
  branchId: string;
  isOwner?: boolean;
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

export const OperatorQueueView: React.FC<OperatorQueueViewProps> = ({ branchId, isOwner = false }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [advancingOrderId, setAdvancingOrderId] = useState<string | null>(null);

  // Counter direct booking box state
  const [bookingBoxOpen, setBookingBoxOpen] = useState<boolean>(false);
  const [catalogCategories, setCatalogCategories] = useState<CatalogCategory[]>([]);
  const [catalogLoading, setCatalogLoading] = useState<boolean>(false);
  const [selectedQuantities, setSelectedQuantities] = useState<Record<string, number>>({});
  const [targetBookingStage, setTargetBookingStage] = useState<OrderStatus>(OrderStatus.CONFIRMED);
  const [bookingPaymentMethod, setBookingPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [bookingNotes, setBookingNotes] = useState<string>('');
  const [bookingCustomerName, setBookingCustomerName] = useState<string>('');
  const [bookingSubmitting, setBookingSubmitting] = useState<boolean>(false);
  const [bookingSuccessMsg, setBookingSuccessMsg] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // Modal states
  const [paymentModalData, setPaymentModalData] = useState<{ order: Order; payments: Payment[] } | null>(null);
  const [editModalData, setEditModalData] = useState<{
    order: Order;
    items: OrderItem[];
    payments: Payment[];
  } | null>(null);

  // Cancellation modal states
  const [cancellingOrder, setCancellingOrder] = useState<Order | null>(null);
  const [cancelRefundType, setCancelRefundType] = useState<'FULL' | 'PARTIAL' | 'NONE'>('FULL');
  const [cancelRefundAmount, setCancelRefundAmount] = useState<string>('');
  const [cancelReason, setCancelReason] = useState<string>('Customer requested');
  const [cancelRestock, setCancelRestock] = useState<boolean>(true);
  const [cancelSubmitting, setCancelSubmitting] = useState<boolean>(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const handleOpenCancel = (order: Order) => {
    setCancellingOrder(order);
    setCancelRefundType('FULL');
    setCancelRefundAmount(order.total.toString());
    setCancelReason('Customer requested cancellation');
    setCancelRestock(true);
    setCancelError(null);
  };

  const handleConfirmCancel = async () => {
    if (!cancellingOrder) return;
    setCancelSubmitting(true);
    setCancelError(null);
    try {
      const refundAmt =
        cancelRefundType === 'PARTIAL'
          ? parseFloat(cancelRefundAmount) || 0
          : cancelRefundType === 'FULL'
          ? cancellingOrder.total
          : 0;
      const res = await orderApiClient.cancelBranchOrder(branchId, cancellingOrder.id, {
        refundType: cancelRefundType,
        refundAmount: refundAmt,
        reason: cancelReason,
        restockInventory: cancelRestock,
      });
      if (res.success) {
        setCancellingOrder(null);
        await fetchOrders();
      } else {
        setCancelError(res.error.message || 'Failed to cancel order');
      }
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Network error during cancellation');
    } finally {
      setCancelSubmitting(false);
    }
  };

  const handleOpenEdit = async (order: Order) => {
    try {
      const detail = await orderApiClient.getBranchOrderDetail(branchId, order.id);
      if (detail.success) {
        setEditModalData({
          order: detail.data.order,
          items: detail.data.items,
          payments: detail.data.payments,
        });
      } else {
        setError(detail.error.message || 'Failed to load order for editing');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load order for editing');
    }
  };

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

  const fetchCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const res = await orderApiClient.getCatalog(branchId);
      if (res.success && res.data?.catalog) {
        setCatalogCategories(res.data.catalog);
      }
    } catch {
      // ignore
    } finally {
      setCatalogLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    if (bookingBoxOpen && catalogCategories.length === 0) {
      fetchCatalog();
    }
  }, [bookingBoxOpen, catalogCategories.length, fetchCatalog]);

  const allProducts = useMemo(() => {
    return catalogCategories.flatMap((c) => c.products);
  }, [catalogCategories]);

  const bookingSubtotal = useMemo(() => {
    return Object.entries(selectedQuantities).reduce((acc, [prodId, qty]) => {
      const p = allProducts.find((it) => it.id === prodId);
      return acc + (p ? p.price * qty : 0);
    }, 0);
  }, [selectedQuantities, allProducts]);

  const selectedItemCount = useMemo(() => {
    return Object.values(selectedQuantities).reduce((acc, q) => acc + q, 0);
  }, [selectedQuantities]);

  const handleUpdateItemQty = (productId: string, delta: number) => {
    setSelectedQuantities((prev) => {
      const current = prev[productId] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      return { ...prev, [productId]: next };
    });
  };

  const handleBookOrder = async () => {
    const items = Object.entries(selectedQuantities)
      .filter(([_, qty]) => qty > 0)
      .map(([productId, quantity]) => ({ productId, quantity }));

    if (items.length === 0) {
      setBookingError('Please select at least one item from the menu.');
      return;
    }

    setBookingSubmitting(true);
    setBookingError(null);
    setBookingSuccessMsg(null);

    try {
      const fullNotes = [
        bookingCustomerName ? `Customer: ${bookingCustomerName}` : '',
        bookingNotes ? `Notes: ${bookingNotes}` : '',
      ].filter(Boolean).join(' | ');

      const res = await orderApiClient.createBranchOrder(branchId, {
        items,
        initialStatus: targetBookingStage,
        paymentMethod: bookingPaymentMethod,
        paymentNotes: fullNotes || 'Counter operator direct booking',
      });

      if (res.success && res.data) {
        const stageLabel =
          targetBookingStage === OrderStatus.PENDING
            ? 'Payment Left'
            : targetBookingStage === OrderStatus.CONFIRMED
            ? 'Payment done'
            : targetBookingStage === OrderStatus.PREPARING
            ? 'Preparing'
            : targetBookingStage === OrderStatus.READY
            ? 'Ready'
            : 'Collected';

        setBookingSuccessMsg(
          `🎉 Order ${res.data.order.order_number} booked successfully at stage "${stageLabel}"! (Total: ₹${res.data.order.total.toFixed(2)})`
        );
        setSelectedQuantities({});
        setBookingNotes('');
        setBookingCustomerName('');
        await fetchOrders();
      } else {
        const errorMsg = !res.success ? res.error?.message : 'Failed to book order';
        setBookingError(errorMsg || 'Failed to book order');
      }
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : 'Error booking order');
    } finally {
      setBookingSubmitting(false);
    }
  };

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

  // Determine if order is expired based on either explicit status or elapsed expiry timestamp
  const isOrderExpired = (o: Order) =>
    o.status === OrderStatus.EXPIRED ||
    (o.status === OrderStatus.PENDING && new Date(o.expires_at).getTime() <= Date.now());

  // Move order through its lifecycle stages
  const handleAdvanceStage = async (order: Order, targetStatus: OrderStatus) => {
    if (advancingOrderId) return;
    setAdvancingOrderId(order.id);
    setError(null);

    try {
      if (isOrderExpired(order)) {
        setError('Cannot process expired order. Please ask the customer to place a new order.');
        return;
      }

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

          if (!recRes.success) {
            setError(recRes.error?.message || 'Failed to record payment');
            return;
          }

          const verRes = await orderApiClient.verifyPayment(
            branchId,
            order.id,
            recRes.data.payment.id,
            'Counter verified'
          );

          if (!verRes.success) {
            setError(verRes.error?.message || 'Failed to verify payment');
            return;
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

  // Tabs: removed 'Pending' and replaced with 'Payment Left'
  const tabs = [
    { id: 'ALL', label: 'All Orders' },
    { id: OrderStatus.PENDING, label: 'Payment Left' },
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
        (o) => isOrderExpired(o) || o.status === OrderStatus.CANCELLED
      ).length;
    }
    if (tabId === OrderStatus.PENDING) {
      return orders.filter((o) => o.status === OrderStatus.PENDING && !isOrderExpired(o)).length;
    }
    return orders.filter((o) => o.status === tabId).length;
  };

  const filteredOrders = orders.filter((o) => {
    if (activeTab === 'ALL') return true;
    if (activeTab === OrderStatus.EXPIRED) {
      return isOrderExpired(o) || o.status === OrderStatus.CANCELLED;
    }
    if (activeTab === OrderStatus.PENDING) {
      return o.status === OrderStatus.PENDING && !isOrderExpired(o);
    }
    return o.status === activeTab;
  });

  // Sort: Latest orders on top, Expired/Cancelled at bottom
  const sortedOrders = [...filteredOrders].sort((a, b) => {
    const aTerminal = isOrderExpired(a) || a.status === OrderStatus.CANCELLED;
    const bTerminal = isOrderExpired(b) || b.status === OrderStatus.CANCELLED;
    if (aTerminal && !bTerminal) return 1;
    if (!aTerminal && bTerminal) return -1;
    return new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime();
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
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            onClick={() => setBookingBoxOpen((prev) => !prev)}
            style={{
              padding: '0.55rem 1.35rem',
              background: bookingBoxOpen ? '#2b1233' : '#ffffff',
              color: bookingBoxOpen ? '#ffffff' : '#2b1233',
              border: '1px solid #f4d3dd',
              borderRadius: '9999px',
              fontWeight: 800,
              fontSize: '0.8125rem',
              cursor: 'pointer',
              boxShadow: '0 2px 8px -4px rgba(120,20,60,0.1)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.15s ease',
            }}
          >
            <span>{bookingBoxOpen ? '✕ Close Counter POS' : '➕ Book Counter Order (POS)'}</span>
          </button>
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
      </div>

      {/* Operator Counter Direct Booking Box */}
      {bookingBoxOpen && (
        <div
          style={{
            background: '#ffffff',
            border: '2px solid #f4d3dd',
            borderRadius: '1.25rem',
            padding: '1.5rem',
            marginBottom: '1.75rem',
            boxShadow: '0 12px 32px -12px rgba(120, 20, 60, 0.15)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.25rem',
              borderBottom: '1px solid #fce7f3',
              paddingBottom: '0.75rem',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.3rem' }}>🍦</span>
                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#2b1233' }}>
                  Operator Counter Order Booking
                </h2>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    background: '#fce7f3',
                    color: '#9d174d',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '9999px',
                  }}
                >
                  POS Desk
                </span>
              </div>
              <p style={{ margin: '0.25rem 0 0 0', color: '#6f5569', fontSize: '0.8125rem', fontWeight: 600 }}>
                Book counter orders directly on behalf of walk-in customers and select the initial workflow stage from your end.
              </p>
            </div>
            <button
              onClick={() => setBookingBoxOpen(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#6f5569',
                fontSize: '1.25rem',
                cursor: 'pointer',
                padding: '0.25rem 0.5rem',
                fontWeight: 700,
              }}
              title="Close"
            >
              ✕
            </button>
          </div>

          {bookingSuccessMsg && (
            <div
              style={{
                background: '#dcfce7',
                border: '1px solid #86efac',
                color: '#166534',
                padding: '0.75rem 1rem',
                borderRadius: '0.75rem',
                marginBottom: '1rem',
                fontSize: '0.875rem',
                fontWeight: 700,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>{bookingSuccessMsg}</span>
              <button
                onClick={() => setBookingSuccessMsg(null)}
                style={{ background: 'transparent', border: 'none', color: '#166534', cursor: 'pointer', fontWeight: 800 }}
              >
                ✕
              </button>
            </div>
          )}

          {bookingError && (
            <div
              style={{
                background: '#fee2e2',
                border: '1px solid #fca5a5',
                color: '#991b1b',
                padding: '0.75rem 1rem',
                borderRadius: '0.75rem',
                marginBottom: '1rem',
                fontSize: '0.875rem',
                fontWeight: 700,
              }}
            >
              {bookingError}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
            {/* Column 1: Items Selection */}
            <div>
              <div
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 800,
                  color: '#2b1233',
                  marginBottom: '0.75rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>1. Select Menu Items ({selectedItemCount} chosen)</span>
                {catalogLoading && <span style={{ fontSize: '0.75rem', color: '#d61c5d' }}>Loading catalog...</span>}
              </div>

              <div
                style={{
                  maxHeight: '380px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  paddingRight: '0.5rem',
                }}
              >
                {catalogCategories.length === 0 && !catalogLoading && (
                  <div style={{ padding: '1.5rem', textAlign: 'center', color: '#6f5569', fontSize: '0.85rem' }}>
                    No items found in this branch catalog.
                  </div>
                )}

                {catalogCategories.map((cat) => (
                  <div
                    key={cat.category.id}
                    style={{ background: '#fff1f4', borderRadius: '0.85rem', padding: '0.75rem', border: '1px solid #f4d3dd' }}
                  >
                    <div
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 900,
                        textTransform: 'uppercase',
                        color: '#9d174d',
                        letterSpacing: '0.05em',
                        marginBottom: '0.5rem',
                      }}
                    >
                      {cat.category.name}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {cat.products.map((p) => {
                        const qty = selectedQuantities[p.id] || 0;
                        return (
                          <div
                            key={p.id}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              background: '#ffffff',
                              padding: '0.5rem 0.75rem',
                              borderRadius: '0.5rem',
                              border: qty > 0 ? '1px solid #d61c5d' : '1px solid #fce7f3',
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 800, fontSize: '0.875rem', color: '#2b1233' }}>
                                {p.name}
                              </div>
                              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#d61c5d' }}>
                                ₹{p.price.toFixed(2)}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <button
                                type="button"
                                onClick={() => handleUpdateItemQty(p.id, -1)}
                                disabled={qty === 0}
                                style={{
                                  width: '26px',
                                  height: '26px',
                                  borderRadius: '9999px',
                                  border: '1px solid #f4d3dd',
                                  background: qty > 0 ? '#fff1f4' : '#f9fafb',
                                  color: qty > 0 ? '#2b1233' : '#9ca3af',
                                  fontWeight: 800,
                                  cursor: qty > 0 ? 'pointer' : 'default',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                -
                              </button>
                              <span style={{ minWidth: '18px', textAlign: 'center', fontWeight: 800, fontSize: '0.875rem' }}>
                                {qty}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdateItemQty(p.id, 1)}
                                style={{
                                  width: '26px',
                                  height: '26px',
                                  borderRadius: '9999px',
                                  border: 'none',
                                  background: '#d61c5d',
                                  color: '#ffffff',
                                  fontWeight: 800,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                +
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Column 2: Stage Selection, Payment & Actions */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                background: '#fafafa',
                padding: '1rem',
                borderRadius: '1rem',
                border: '1px solid #f0f0f0',
              }}
            >
              {/* Stage Selection */}
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 800, color: '#2b1233', marginBottom: '0.5rem' }}>
                  2. Select Initial Order Stage (Operator Controlled)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {[
                    {
                      status: OrderStatus.PENDING,
                      label: 'Payment Left',
                      desc: 'Order placed, payment pending at counter',
                      badgeBg: '#fef3c7',
                      badgeText: '#92400e',
                    },
                    {
                      status: OrderStatus.CONFIRMED,
                      label: 'Payment done',
                      desc: 'Payment received & confirmed, ready for kitchen',
                      badgeBg: '#dcfce7',
                      badgeText: '#166534',
                    },
                    {
                      status: OrderStatus.PREPARING,
                      label: 'Preparing',
                      desc: 'Scoops currently being scooped/prepared',
                      badgeBg: '#fef08a',
                      badgeText: '#854d0e',
                    },
                    {
                      status: OrderStatus.READY,
                      label: 'Ready',
                      desc: 'Order is ready on counter for customer pickup',
                      badgeBg: '#dbeafe',
                      badgeText: '#1e40af',
                    },
                    {
                      status: OrderStatus.COMPLETED,
                      label: 'Collected / All done',
                      desc: 'Order handed over to customer',
                      badgeBg: '#fce7f3',
                      badgeText: '#9d174d',
                    },
                  ].map((st) => {
                    const isSel = targetBookingStage === st.status;
                    return (
                      <div
                        key={st.status}
                        onClick={() => setTargetBookingStage(st.status)}
                        style={{
                          padding: '0.55rem 0.85rem',
                          borderRadius: '0.75rem',
                          border: isSel ? '2px solid #d61c5d' : '1px solid #e5e7eb',
                          background: isSel ? '#fff1f4' : '#ffffff',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span
                              style={{
                                fontSize: '0.75rem',
                                fontWeight: 800,
                                background: st.badgeBg,
                                color: st.badgeText,
                                padding: '0.15rem 0.5rem',
                                borderRadius: '9999px',
                              }}
                            >
                              {st.label}
                            </span>
                            {isSel && <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#d61c5d' }}>✓ Selected</span>}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#6f5569', marginTop: '0.2rem' }}>
                            {st.desc}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Payment Method (if not PENDING) */}
              {targetBookingStage !== OrderStatus.PENDING && (
                <div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 800, color: '#2b1233', marginBottom: '0.4rem' }}>
                    Payment Method:
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {[
                      { method: PaymentMethod.CASH, label: '💵 Cash' },
                      { method: PaymentMethod.UPI, label: '📱 UPI' },
                      { method: PaymentMethod.CARD, label: '💳 Card' },
                    ].map((pm) => (
                      <button
                        key={pm.method}
                        type="button"
                        onClick={() => setBookingPaymentMethod(pm.method)}
                        style={{
                          flex: 1,
                          padding: '0.4rem 0.75rem',
                          borderRadius: '9999px',
                          border: bookingPaymentMethod === pm.method ? '2px solid #d61c5d' : '1px solid #d1d5db',
                          background: bookingPaymentMethod === pm.method ? '#d61c5d' : '#ffffff',
                          color: bookingPaymentMethod === pm.method ? '#ffffff' : '#374151',
                          fontWeight: 800,
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                        }}
                      >
                        {pm.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Customer Details */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#6f5569', marginBottom: '0.2rem' }}>
                    Customer Name/Phone:
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Walk-in / 98765..."
                    value={bookingCustomerName}
                    onChange={(e) => setBookingCustomerName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.4rem 0.6rem',
                      borderRadius: '0.5rem',
                      border: '1px solid #d1d5db',
                      fontSize: '0.8125rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#6f5569', marginBottom: '0.2rem' }}>
                    Order Note:
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Extra spoon / Table 4"
                    value={bookingNotes}
                    onChange={(e) => setBookingNotes(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.4rem 0.6rem',
                      borderRadius: '0.5rem',
                      border: '1px solid #d1d5db',
                      fontSize: '0.8125rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {/* Total & Submit */}
              <div style={{ marginTop: 'auto', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#6f5569' }}>
                    Subtotal ({selectedItemCount} items):
                  </span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#d61c5d' }}>
                    ₹{bookingSubtotal.toFixed(2)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleBookOrder}
                  disabled={bookingSubmitting || selectedItemCount === 0}
                  style={{
                    width: '100%',
                    padding: '0.7rem 1.25rem',
                    background: selectedItemCount === 0 ? '#e5e7eb' : '#d61c5d',
                    color: selectedItemCount === 0 ? '#9ca3af' : '#ffffff',
                    border: 'none',
                    borderRadius: '9999px',
                    fontWeight: 800,
                    fontSize: '0.9rem',
                    cursor: selectedItemCount === 0 || bookingSubmitting ? 'not-allowed' : 'pointer',
                    boxShadow: selectedItemCount > 0 ? '0 3px 0 #a3134a' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {bookingSubmitting ? 'Booking Order...' : `⚡ Book Order (₹${bookingSubtotal.toFixed(2)})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
            const badge = getStatusBadge(order);
            const isPending = order.status === OrderStatus.PENDING && !isOrderExpired(order);
            const isConfirmed = order.status === OrderStatus.CONFIRMED;
            const isCompleted = order.status === OrderStatus.COMPLETED;
            const isTerminalExpired =
              isOrderExpired(order) || order.status === OrderStatus.CANCELLED;
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
                    {/* Right Top Actions & Status Tag */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      {!isCompleted && !isTerminalExpired && (
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(order)}
                          title="Edit order items (starts from payment done stage)"
                          style={{
                            padding: '0.2rem 0.6rem',
                            borderRadius: '9999px',
                            background: '#ffffff',
                            border: '1px solid #d61c5d',
                            color: '#d61c5d',
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.2rem',
                            boxShadow: '0 2px 5px -2px rgba(214,28,93,0.2)',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <span>✏️ Edit</span>
                        </button>
                      )}
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
                        {isOrderExpired(order) ? (
                          '⚠️ Expired Order'
                        ) : (
                          <div>
                            <div>🚫 Cancelled Order</div>
                            {order.cancellation_reason && (
                              <div style={{ fontSize: '0.7rem', fontWeight: 600, marginTop: '0.2rem', color: '#7f1d1d' }}>
                                Reason: {order.cancellation_reason}
                                {(order.refund_amount ?? 0) > 0 && ` • Refund: ₹${order.refund_amount?.toFixed(2)}`}
                              </div>
                            )}
                          </div>
                        )}
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

                    {/* Operator Cancel Button (Can be cancelled at any stage before terminal state) */}
                    {!isTerminalExpired && !isCompleted && (
                      <div style={{ marginTop: '0.6rem', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenCancel(order)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#b91c1c',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            padding: '0.2rem 0.4rem',
                            borderRadius: '0.4rem',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
                        >
                          <span>✕ Cancel Order</span>
                        </button>
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

      {/* Cancellation Modal Dialog */}
      {cancellingOrder && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(43, 18, 51, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '1.5rem',
              padding: '1.75rem',
              maxWidth: '460px',
              width: '100%',
              boxShadow: '0 20px 40px -15px rgba(0,0,0,0.3)',
              border: '1px solid #fca5a5',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#991b1b', fontFamily: 'var(--font-display-family)' }}>
                Cancel Order #{cancellingOrder.order_number}
              </h3>
              <button
                type="button"
                onClick={() => setCancellingOrder(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#6f5569' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.8125rem', color: '#6f5569', marginBottom: '1rem', lineHeight: 1.4 }}>
              Current Stage: <strong style={{ color: '#2b1233' }}>{cancellingOrder.status}</strong> &bull; Total: <strong style={{ color: '#d61c5d' }}>₹{cancellingOrder.total.toFixed(2)}</strong>
            </p>

            {cancelError && (
              <div style={{ padding: '0.6rem 0.8rem', background: '#fee2e2', borderRadius: '0.75rem', color: '#991b1b', fontSize: '0.75rem', fontWeight: 700, marginBottom: '1rem' }}>
                {cancelError}
              </div>
            )}

            {/* Refund Options (Default: Payment Returned for confirmed/preparing/ready) */}
            {cancellingOrder.status !== OrderStatus.PENDING && (
              <div style={{ background: '#fff1f4', border: '1px solid #f4d3dd', borderRadius: '1rem', padding: '1rem', marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: '#2b1233', marginBottom: '0.5rem' }}>
                  Refund Decision (Default: Payment Returned)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', fontWeight: 700, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="refundType"
                      checked={cancelRefundType === 'FULL'}
                      onChange={() => {
                        setCancelRefundType('FULL');
                        setCancelRefundAmount(cancellingOrder.total.toString());
                      }}
                    />
                    <span>Full Refund (₹{cancellingOrder.total.toFixed(2)}) &bull; Payment Returned</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', fontWeight: 700, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="refundType"
                      checked={cancelRefundType === 'PARTIAL'}
                      onChange={() => setCancelRefundType('PARTIAL')}
                    />
                    <span>Partial Refund:</span>
                    {cancelRefundType === 'PARTIAL' && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', marginLeft: '0.25rem' }}>
                        <span>₹</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max={cancellingOrder.total}
                          value={cancelRefundAmount}
                          onChange={(e) => setCancelRefundAmount(e.target.value)}
                          style={{
                            width: '90px',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '0.5rem',
                            border: '1px solid #d61c5d',
                            fontSize: '0.8125rem',
                            fontWeight: 800,
                          }}
                        />
                      </div>
                    )}
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', fontWeight: 700, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="refundType"
                      checked={cancelRefundType === 'NONE'}
                      onChange={() => {
                        setCancelRefundType('NONE');
                        setCancelRefundAmount('0');
                      }}
                    />
                    <span>No Refund (₹0.00)</span>
                  </label>
                </div>
              </div>
            )}

            {/* Inventory Restock Option */}
            {cancellingOrder.status !== OrderStatus.PENDING && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', fontWeight: 700, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={cancelRestock}
                    onChange={(e) => setCancelRestock(e.target.checked)}
                  />
                  <span>Restock order items back to inventory</span>
                </label>
              </div>
            )}

            {/* Reason */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', marginBottom: '0.35rem', textTransform: 'uppercase' }}>
                Cancellation Reason
              </label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Reason for cancellation..."
                style={{
                  width: '100%',
                  padding: '0.6rem 0.75rem',
                  borderRadius: '0.75rem',
                  border: '1px solid #f4d3dd',
                  fontSize: '0.8125rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setCancellingOrder(null)}
                disabled={cancelSubmitting}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '9999px',
                  border: '1px solid #f4d3dd',
                  background: '#ffffff',
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Keep Order
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={cancelSubmitting}
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: '9999px',
                  border: 'none',
                  background: '#dc2626',
                  color: '#ffffff',
                  fontSize: '0.8125rem',
                  fontWeight: 800,
                  cursor: cancelSubmitting ? 'wait' : 'pointer',
                  boxShadow: '0 3px 0 #991b1b',
                }}
              >
                {cancelSubmitting ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
