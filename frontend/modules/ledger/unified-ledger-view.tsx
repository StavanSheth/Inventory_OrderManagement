'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { orderApiClient } from '../../services/order-api-client';
import { apiClient } from '../../services/api-client';
import { Order, InventoryMovement } from '../../../shared/types/entities.types';
import { OrderStatus } from '../../../shared/enums/order.enum';
import { InventoryMovementType } from '../../../shared/enums/inventory.enum';

interface UnifiedLedgerViewProps {
  branchId: string;
  isOwner?: boolean;
}

type LedgerFilter = 'ALL' | 'ORDERS' | 'INVENTORY';

export const UnifiedLedgerView: React.FC<UnifiedLedgerViewProps> = ({ branchId, isOwner = false }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<LedgerFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchLedgerData = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch Orders
      const orderRes = await orderApiClient.listBranchOrders(branchId, undefined, 100);
      if (orderRes.success) {
        setOrders(orderRes.data);
      }

      // 2. Fetch Inventory Movements
      const movRes = await apiClient.request<InventoryMovement[]>(
        `/api/v1/branches/${branchId}/inventory/movements`,
        { authenticated: true, requireSession: true }
      );
      if (movRes.success) {
        setMovements(movRes.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch ledger transactions');
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    fetchLedgerData();
  }, [fetchLedgerData]);

  // Combined ledger entries
  const combinedEntries = useMemo(() => {
    const list: Array<{
      id: string;
      type: 'ORDER' | 'INVENTORY';
      timestamp: string;
      reference: string;
      title: string;
      category: string;
      amountOrDelta: string;
      statusOrReason: string;
      isPositive: boolean;
    }> = [];

    // Map Orders
    orders.forEach((o) => {
      const isPaid = o.payment_status === 'VERIFIED' || o.payment_status === 'COMPLETED';
      list.push({
        id: `ord-${o.id}`,
        type: 'ORDER',
        timestamp: o.placed_at,
        reference: o.order_number,
        title: `Order #${o.order_number} (${o.status})`,
        category: 'Sales & Orders',
        amountOrDelta: `₹${o.total.toFixed(2)}`,
        statusOrReason: `${o.status} • Payment: ${o.payment_status}`,
        isPositive: isPaid && o.status !== OrderStatus.CANCELLED,
      });
    });

    // Map Movements
    movements.forEach((m) => {
      const isRefill = m.movement_type === InventoryMovementType.REFILL;
      const deltaSign = m.quantity_delta > 0 ? `+${m.quantity_delta}` : `${m.quantity_delta}`;
      const itemName = m.product_id ? `Product: ${m.product_id}` : `Material: ${m.raw_material_id}`;

      list.push({
        id: `mov-${m.id}`,
        type: 'INVENTORY',
        timestamp: m.created_at,
        reference: m.id.slice(0, 10),
        title: `${m.movement_type} - ${itemName}`,
        category: 'Inventory Stock',
        amountOrDelta: `${deltaSign} units`,
        statusOrReason: m.reason || m.reference_type || 'Stock movement ledger',
        isPositive: isRefill,
      });
    });

    // Sort by timestamp descending
    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [orders, movements]);

  // Filter and search
  const filteredEntries = useMemo(() => {
    return combinedEntries.filter((item) => {
      if (filter === 'ORDERS' && item.type !== 'ORDER') return false;
      if (filter === 'INVENTORY' && item.type !== 'INVENTORY') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.reference.toLowerCase().includes(q) ||
          item.title.toLowerCase().includes(q) ||
          item.statusOrReason.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [combinedEntries, filter, searchQuery]);

  // Financial & inventory stats
  const totalRevenue = useMemo(() => {
    return orders
      .filter((o) => o.status !== OrderStatus.CANCELLED && o.status !== OrderStatus.EXPIRED)
      .reduce((sum, o) => sum + o.total, 0);
  }, [orders]);

  const totalStockIn = useMemo(() => {
    return movements
      .filter((m) => m.quantity_delta > 0)
      .reduce((sum, m) => sum + m.quantity_delta, 0);
  }, [movements]);

  const totalStockOut = useMemo(() => {
    return movements
      .filter((m) => m.quantity_delta < 0)
      .reduce((sum, m) => sum + Math.abs(m.quantity_delta), 0);
  }, [movements]);

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto', fontFamily: 'var(--font-body-family), system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display-family)', fontSize: '2rem', fontWeight: 800, margin: '0 0 0.25rem 0', color: '#2b1233' }}>
            Unified Branch Ledger
          </h1>
          <p style={{ margin: 0, color: '#6f5569', fontSize: '0.875rem', fontWeight: 600 }}>
            Realtime dual audit trail for Orders and Inventory Movements (Branch: {branchId})
          </p>
        </div>
        <button
          onClick={fetchLedgerData}
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
          Refresh Ledger
        </button>
      </div>

      {/* Metrics Overview Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ background: '#ffffff', border: '1px solid #f4d3dd', borderRadius: '1.25rem', padding: '1.25rem', boxShadow: '0 4px 12px -4px rgba(120,20,60,0.08)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: '#6f5569', letterSpacing: '0.05em' }}>
            Orders Total Value
          </span>
          <div style={{ fontFamily: 'var(--font-display-family)', fontSize: '1.75rem', fontWeight: 900, color: '#d61c5d', marginTop: '0.35rem' }}>
            ₹{totalRevenue.toFixed(2)}
          </div>
          <span style={{ fontSize: '0.75rem', color: '#6f5569', fontWeight: 600 }}>
            {orders.length} orders recorded
          </span>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #f4d3dd', borderRadius: '1.25rem', padding: '1.25rem', boxShadow: '0 4px 12px -4px rgba(120,20,60,0.08)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: '#6f5569', letterSpacing: '0.05em' }}>
            Stock Inflow (Refills)
          </span>
          <div style={{ fontFamily: 'var(--font-display-family)', fontSize: '1.75rem', fontWeight: 900, color: '#16a34a', marginTop: '0.35rem' }}>
            +{totalStockIn.toFixed(2)}
          </div>
          <span style={{ fontSize: '0.75rem', color: '#6f5569', fontWeight: 600 }}>
            Units replenished
          </span>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #f4d3dd', borderRadius: '1.25rem', padding: '1.25rem', boxShadow: '0 4px 12px -4px rgba(120,20,60,0.08)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: '#6f5569', letterSpacing: '0.05em' }}>
            Stock Outflow (Consumed)
          </span>
          <div style={{ fontFamily: 'var(--font-display-family)', fontSize: '1.75rem', fontWeight: 900, color: '#dc2626', marginTop: '0.35rem' }}>
            -{totalStockOut.toFixed(2)}
          </div>
          <span style={{ fontSize: '0.75rem', color: '#6f5569', fontWeight: 600 }}>
            Units consumed in orders & waste
          </span>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #f4d3dd', borderRadius: '1.25rem', padding: '1.25rem', boxShadow: '0 4px 12px -4px rgba(120,20,60,0.08)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: '#6f5569', letterSpacing: '0.05em' }}>
            Total Audit Records
          </span>
          <div style={{ fontFamily: 'var(--font-display-family)', fontSize: '1.75rem', fontWeight: 900, color: '#2b1233', marginTop: '0.35rem' }}>
            {combinedEntries.length}
          </div>
          <span style={{ fontSize: '0.75rem', color: '#6f5569', fontWeight: 600 }}>
            Combined transactions
          </span>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          marginBottom: '1.25rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {[
            { id: 'ALL', label: 'All Activity' },
            { id: 'ORDERS', label: 'Orders Ledger' },
            { id: 'INVENTORY', label: 'Inventory Ledger' },
          ].map((t) => {
            const isSelected = filter === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setFilter(t.id as LedgerFilter)}
                style={{
                  padding: '0.45rem 1rem',
                  borderRadius: '9999px',
                  border: isSelected ? 'none' : '1px solid #f4d3dd',
                  background: isSelected ? '#d61c5d' : '#ffffff',
                  color: isSelected ? '#ffffff' : '#2b1233',
                  fontSize: '0.8125rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: isSelected ? '0 3px 0 #a3134a' : '0 2px 8px -4px rgba(120,20,60,0.08)',
                  transition: 'all 0.15s ease',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <input
          type="text"
          placeholder="Search by order #, item, reason..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            padding: '0.45rem 1rem',
            borderRadius: '9999px',
            border: '1px solid #f4d3dd',
            background: '#ffffff',
            fontSize: '0.8125rem',
            color: '#2b1233',
            minWidth: '260px',
            outline: 'none',
          }}
        />
      </div>

      {/* Error state */}
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
          Loading unified ledger records...
        </div>
      )}

      {/* Ledger Table */}
      {!loading && (
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #f4d3dd',
            borderRadius: '1.5rem',
            overflow: 'hidden',
            boxShadow: '0 8px 24px -12px rgba(120,20,60,0.1)',
          }}
        >
          {filteredEntries.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#6f5569', fontWeight: 700 }}>
              No ledger records found matching criteria.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ background: '#fff1f4', borderBottom: '1px solid #f4d3dd', color: '#6f5569', fontWeight: 800 }}>
                    <th style={{ padding: '0.85rem 1rem' }}>Type</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Timestamp</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Reference / ID</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Description</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Details / Reason</th>
                    <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Amount / Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((row) => (
                    <tr
                      key={row.id}
                      style={{
                        borderBottom: '1px solid #f8e4eb',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span
                          style={{
                            padding: '0.2rem 0.6rem',
                            borderRadius: '9999px',
                            fontSize: '0.72rem',
                            fontWeight: 900,
                            background: row.type === 'ORDER' ? '#fce7f3' : '#e0f2fe',
                            color: row.type === 'ORDER' ? '#9d174d' : '#0369a1',
                          }}
                        >
                          {row.type}
                        </span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', color: '#6f5569', whiteSpace: 'nowrap' }}>
                        {new Date(row.timestamp).toLocaleString()}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', fontWeight: 800, color: '#2b1233' }}>
                        {row.reference}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', fontWeight: 700, color: '#2b1233' }}>
                        {row.title}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', color: '#6f5569' }}>
                        {row.statusOrReason}
                      </td>
                      <td
                        style={{
                          padding: '0.85rem 1rem',
                          textAlign: 'right',
                          fontWeight: 900,
                          fontSize: '0.9rem',
                          color: row.isPositive ? '#16a34a' : '#d61c5d',
                        }}
                      >
                        {row.amountOrDelta}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
export default UnifiedLedgerView;
