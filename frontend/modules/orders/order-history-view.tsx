'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ownerApiClient } from '../../services/owner-api-client';
import { Order, OrderItem } from '../../../shared/types/entities.types';
import { OrderStatus } from '../../../shared/enums/order.enum';
import { OrderDetailModal } from './order-detail-modal';
import { exportToExcel, exportToPdf } from '../../utils/export-helpers';

type OrderWithItems = Order & { items?: OrderItem[] };

interface UnifiedOrderHistoryViewProps {
  branches: Array<{ id: string; name: string; code: string }>;
  defaultBranchId?: string;
  isOwner?: boolean;
}

export const UnifiedOrderHistoryView: React.FC<UnifiedOrderHistoryViewProps> = ({
  branches,
  defaultBranchId = 'ALL',
  isOwner = true,
}) => {
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(15);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedBranchId, setSelectedBranchId] = useState<string>(defaultBranchId);
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [customerFilter, setCustomerFilter] = useState<string>('');
  const [activeDatePreset, setActiveDatePreset] = useState<string>('ALL');

  const applyDatePreset = (preset: 'ALL' | 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'LAST_3_MONTHS' | 'LAST_6_MONTHS' | 'LAST_12_MONTHS') => {
    setActiveDatePreset(preset);
    const now = new Date();
    const toYMD = (d: Date) => d.toISOString().split('T')[0];
    const todayStr = toYMD(now);

    if (preset === 'ALL') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'TODAY') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'THIS_WEEK') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const startOfWeek = new Date(now.getFullYear(), now.getMonth(), diff);
      setStartDate(toYMD(startOfWeek));
      setEndDate(todayStr);
    } else if (preset === 'THIS_MONTH') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(toYMD(startOfMonth));
      setEndDate(todayStr);
    } else if (preset === 'LAST_3_MONTHS') {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      setStartDate(toYMD(d));
      setEndDate(todayStr);
    } else if (preset === 'LAST_6_MONTHS') {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 6);
      setStartDate(toYMD(d));
      setEndDate(todayStr);
    } else if (preset === 'LAST_12_MONTHS') {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 12);
      setStartDate(toYMD(d));
      setEndDate(todayStr);
    }
    setPage(1);
  };

  // Order Details Modal
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await ownerApiClient.getOrderHistory({
        branchId: selectedBranchId === 'ALL' ? undefined : selectedBranchId,
        status: selectedStatus === 'ALL' ? undefined : (selectedStatus as OrderStatus),
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate ? new Date(endDate).toISOString() : undefined,
        customerUserId: customerFilter ? customerFilter.trim() : undefined,
        page,
        limit: pageSize,
      });

      if (res.success) {
        setOrders(res.data.orders);
        setTotalCount(res.data.totalCount);
        setTotalPages(res.data.totalPages);
      } else {
        setError(res.error.message || 'Failed to fetch order history');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [selectedBranchId, selectedStatus, startDate, endDate, customerFilter, page, pageSize]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const isOrderExpired = (o: Order) =>
    o.status === OrderStatus.EXPIRED ||
    (o.status === OrderStatus.PENDING && new Date(o.expires_at).getTime() <= Date.now());

  const getStatusBadge = (order: Order) => {
    let bg = '#eee';
    let text = '#333';
    let label = order.status;

    if (isOrderExpired(order)) {
      bg = '#fee2e2';
      text = '#991b1b';
      label = OrderStatus.EXPIRED;
    } else {
      switch (order.status) {
        case OrderStatus.PENDING:
          bg = '#fff3cd';
          text = '#856404';
          break;
        case OrderStatus.CONFIRMED:
          bg = '#cce5ff';
          text = '#004085';
          break;
        case OrderStatus.PREPARING:
          bg = '#d1ecf1';
          text = '#0c5460';
          break;
        case OrderStatus.READY:
          bg = '#d4edda';
          text = '#155724';
          break;
        case OrderStatus.COMPLETED:
          bg = '#28a745';
          text = '#ffffff';
          break;
        case OrderStatus.CANCELLED:
          bg = '#f8d7da';
          text = '#721c24';
          break;
        case OrderStatus.EXPIRED:
          bg = '#fee2e2';
          text = '#991b1b';
          break;
      }
    }
    return (
      <span
        style={{
          background: bg,
          color: text,
          padding: '0.25rem 0.6rem',
          borderRadius: '9999px',
          fontSize: '0.75rem',
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label.replace(/_/g, ' ')}
      </span>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Filter Toolbar */}
      <div
        style={{
          background: '#ffffff',
          padding: '1.25rem 1.5rem',
          borderRadius: '1rem',
          border: '1px solid #f4d3dd',
          boxShadow: '0 4px 16px -6px rgba(120, 20, 60, 0.08)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Branch filter (if owner) */}
          {isOwner && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', textTransform: 'uppercase' }}>Branch:</span>
              <select
                value={selectedBranchId}
                onChange={(e) => {
                  setSelectedBranchId(e.target.value);
                  setPage(1);
                }}
                style={{
                  padding: '0.45rem 0.85rem',
                  borderRadius: '9999px',
                  border: '1px solid #f4d3dd',
                  background: '#fff1f4',
                  fontWeight: 700,
                  fontSize: '0.8125rem',
                  color: '#2b1233',
                  outline: 'none',
                }}
              >
                <option value="ALL">All Branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Status filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', textTransform: 'uppercase' }}>Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '9999px',
                border: '1px solid #f4d3dd',
                background: '#fff1f4',
                fontWeight: 700,
                fontSize: '0.8125rem',
                color: '#2b1233',
                outline: 'none',
              }}
            >
              <option value="ALL">All Statuses</option>
              {Object.values(OrderStatus).map((st) => (
                <option key={st} value={st}>
                  {st.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          {/* Date range filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', textTransform: 'uppercase' }}>From:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              style={{
                padding: '0.35rem 0.6rem',
                borderRadius: '0.5rem',
                border: '1px solid #f4d3dd',
                fontSize: '0.8125rem',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', textTransform: 'uppercase' }}>To:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setActiveDatePreset('CUSTOM');
                setPage(1);
              }}
              style={{
                padding: '0.35rem 0.6rem',
                borderRadius: '0.5rem',
                border: '1px solid #f4d3dd',
                fontSize: '0.8125rem',
              }}
            />
          </div>

          {/* Quick Date Presets */}
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              { id: 'ALL', label: 'All' },
              { id: 'TODAY', label: 'Today' },
              { id: 'THIS_WEEK', label: 'This Week' },
              { id: 'THIS_MONTH', label: 'This Month' },
              { id: 'LAST_3_MONTHS', label: '3M' },
              { id: 'LAST_6_MONTHS', label: '6M' },
              { id: 'LAST_12_MONTHS', label: '12M' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyDatePreset(p.id as any)}
                style={{
                  padding: '0.25rem 0.6rem',
                  borderRadius: '9999px',
                  border: '1px solid #f4d3dd',
                  background: activeDatePreset === p.id ? '#d61c5d' : '#fff1f4',
                  color: activeDatePreset === p.id ? '#ffffff' : '#2b1233',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Customer filter for owners */}
          {isOwner && (
            <input
              type="text"
              placeholder="Search User ID..."
              value={customerFilter}
              onChange={(e) => {
                setCustomerFilter(e.target.value);
                setPage(1);
              }}
              style={{
                padding: '0.4rem 0.8rem',
                borderRadius: '9999px',
                border: '1px solid #f4d3dd',
                fontSize: '0.8125rem',
                width: '140px',
              }}
            />
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          {isOwner && (
            <>
              <button
                type="button"
                onClick={() => {
                  const activeBranchName = branches.find((b) => b.id === selectedBranchId)?.name || 'All Branches';
                  exportToExcel({
                    filename: `order-history-${selectedBranchId}-${selectedStatus.toLowerCase()}`,
                    title: 'Melt Gelato - Order History Report',
                    subtitle: `Enterprise Report • ${activeBranchName}`,
                    filterSummary: {
                      Branch: activeBranchName,
                      Status: selectedStatus,
                      'Date Preset': activeDatePreset,
                      'From Date': startDate || undefined,
                      'To Date': endDate || undefined,
                      Customer: customerFilter || undefined,
                    },
                    columns: [
                      { header: 'Order #', key: 'order_number' },
                      { header: 'Branch', key: 'branch_name' },
                      { header: 'Status', key: 'status' },
                      { header: 'Customer ID', key: 'customer_user_id' },
                      { header: 'Placed At', key: 'placed_at' },
                      { header: 'Subtotal', key: 'subtotal', format: 'currency' },
                      { header: 'Discount', key: 'discount', format: 'currency' },
                      { header: 'Tax', key: 'tax', format: 'currency' },
                      { header: 'Total (₹)', key: 'total', format: 'currency' },
                      { header: 'Payment Status', key: 'payment_status' },
                      { header: 'Payment Method', key: 'payment_method' },
                    ],
                    data: orders.map((o) => ({
                      ...o,
                      branch_name: branches.find((b) => b.id === o.branch_id)?.name || o.branch_id,
                    })),
                  });
                }}
                style={{
                  padding: '0.45rem 0.85rem',
                  borderRadius: '9999px',
                  border: '1px solid #c2e0b3',
                  background: '#f1f8ed',
                  color: '#2d6a1e',
                  fontWeight: 800,
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
                title="Download formatted Excel (.xls) report with active filters"
              >
                <span>📊</span>
                <span>Export Excel</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const activeBranchName = branches.find((b) => b.id === selectedBranchId)?.name || 'All Branches';
                  exportToPdf({
                    filename: `order-history-${selectedBranchId}-${selectedStatus.toLowerCase()}`,
                    title: 'Order History Report',
                    subtitle: `Enterprise Report • ${activeBranchName}`,
                    filterSummary: {
                      Branch: activeBranchName,
                      Status: selectedStatus,
                      'Date Preset': activeDatePreset,
                      'From Date': startDate || undefined,
                      'To Date': endDate || undefined,
                      Customer: customerFilter || undefined,
                    },
                    columns: [
                      { header: 'Order #', key: 'order_number' },
                      { header: 'Branch', key: 'branch_name' },
                      { header: 'Status', key: 'status' },
                      { header: 'Placed At', key: 'placed_at' },
                      { header: 'Subtotal', key: 'subtotal', format: 'currency' },
                      { header: 'Discount', key: 'discount', format: 'currency' },
                      { header: 'Tax', key: 'tax', format: 'currency' },
                      { header: 'Total (₹)', key: 'total', format: 'currency' },
                      { header: 'Payment', key: 'payment_status' },
                    ],
                    data: orders.map((o) => ({
                      ...o,
                      branch_name: branches.find((b) => b.id === o.branch_id)?.name || o.branch_id,
                      placed_at: new Date(o.placed_at).toLocaleDateString(),
                    })),
                  });
                }}
                style={{
                  padding: '0.45rem 0.85rem',
                  borderRadius: '9999px',
                  border: '1px solid #ffd1dc',
                  background: '#fff1f4',
                  color: '#d61c5d',
                  fontWeight: 800,
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
                title="Print or Save as PDF with active filters"
              >
                <span>📄</span>
                <span>Export PDF</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={fetchOrders}
            disabled={loading}
            style={{
              padding: '0.45rem 1rem',
              background: '#d61c5d',
              color: '#ffffff',
              borderRadius: '9999px',
              border: 'none',
              fontWeight: 800,
              fontSize: '0.8125rem',
              cursor: 'pointer',
            }}
          >
            {loading ? 'Loading...' : '🔍 Filter'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '1rem', background: '#ffe5e5', border: '1px solid #ff9999', borderRadius: '0.75rem', color: '#a3134a' }}>
          {error}
        </div>
      )}

      {/* Orders Table */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '1rem',
          border: '1px solid #f4d3dd',
          boxShadow: '0 4px 16px -6px rgba(120, 20, 60, 0.08)',
          overflow: 'hidden',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#fff1f4', borderBottom: '1px solid #f4d3dd', color: '#6f5569', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th style={{ padding: '0.85rem 1.25rem' }}>Order ID</th>
                <th style={{ padding: '0.85rem 1.25rem' }}>Branch</th>
                <th style={{ padding: '0.85rem 1.25rem' }}>Date & Time</th>
                <th style={{ padding: '0.85rem 1.25rem' }}>Items</th>
                <th style={{ padding: '0.85rem 1.25rem' }}>Total</th>
                <th style={{ padding: '0.85rem 1.25rem' }}>Status</th>
                <th style={{ padding: '0.85rem 1.25rem', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.length > 0 ? (
                orders.map((o) => (
                  <tr
                    key={o.id}
                    style={{
                      borderBottom: '1px solid #fcf0f3',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <td style={{ padding: '0.85rem 1.25rem', fontWeight: 800, color: '#2b1233' }}>
                      #{o.id.slice(0, 8)}
                    </td>
                    <td style={{ padding: '0.85rem 1.25rem', color: '#6f5569' }}>
                      {o.branch_id.slice(0, 8)}
                    </td>
                    <td style={{ padding: '0.85rem 1.25rem', color: '#2b1233' }}>
                      {new Date(o.created_at).toLocaleString('en-IN', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td style={{ padding: '0.85rem 1.25rem', color: '#6f5569' }}>
                      {o.items ? `${o.items.length} items` : '1+ items'}
                    </td>
                    <td style={{ padding: '0.85rem 1.25rem', fontWeight: 800, color: '#d61c5d' }}>
                      ₹{o.total.toFixed(2)}
                    </td>
                    <td style={{ padding: '0.85rem 1.25rem' }}>
                      {getStatusBadge(o)}
                    </td>
                    <td style={{ padding: '0.85rem 1.25rem', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => setSelectedOrder(o)}
                        style={{
                          padding: '0.35rem 0.8rem',
                          borderRadius: '9999px',
                          border: '1px solid #f4d3dd',
                          background: '#fff1f4',
                          color: '#2b1233',
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                        }}
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: '#8c7086' }}>
                    {loading ? 'Loading orders...' : 'No orders found matching the filter criteria.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid #f4d3dd',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#ffffff',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ fontSize: '0.8125rem', color: '#6f5569' }}>
            Showing <strong>{orders.length}</strong> of <strong>{totalCount}</strong> orders (Page {page} of {Math.max(1, totalPages)})
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '0.5rem',
                border: '1px solid #f4d3dd',
                background: page <= 1 ? '#fafafa' : '#ffffff',
                color: page <= 1 ? '#ccc' : '#2b1233',
                fontWeight: 700,
                fontSize: '0.8125rem',
                cursor: page <= 1 ? 'not-allowed' : 'pointer',
              }}
            >
              &larr; Previous
            </button>

            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '0.5rem',
                border: '1px solid #f4d3dd',
                background: page >= totalPages ? '#fafafa' : '#ffffff',
                color: page >= totalPages ? '#ccc' : '#2b1233',
                fontWeight: 700,
                fontSize: '0.8125rem',
                cursor: page >= totalPages ? 'not-allowed' : 'pointer',
              }}
            >
              Next &rarr;
            </button>

            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              style={{
                padding: '0.35rem 0.6rem',
                borderRadius: '0.5rem',
                border: '1px solid #f4d3dd',
                fontSize: '0.8125rem',
                background: '#fff1f4',
                color: '#2b1233',
                fontWeight: 700,
              }}
            >
              <option value={10}>10 / page</option>
              <option value={15}>15 / page</option>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
            </select>
          </div>
        </div>
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <OrderDetailModal
          branchId={selectedOrder.branch_id}
          orderId={selectedOrder.id}
          onClose={() => setSelectedOrder(null)}
          onOpenPayment={() => {}}
          onOpenEdit={() => {}}
          onStatusChanged={() => {
            fetchOrders();
          }}
        />
      )}
    </div>
  );
};
