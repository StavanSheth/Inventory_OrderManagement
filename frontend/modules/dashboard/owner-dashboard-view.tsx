'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ownerApiClient } from '../../services/owner-api-client';
import { DashboardSummaryResponse } from '../../../shared/contracts/dashboard.contract';

interface OwnerDashboardViewProps {
  branches: Array<{ id: string; name: string; code: string }>;
  selectedBranchId: string;
  onBranchChange: (branchId: string) => void;
}

export const OwnerDashboardView: React.FC<OwnerDashboardViewProps> = ({
  branches,
  selectedBranchId,
  onBranchChange,
}) => {
  const [data, setData] = useState<DashboardSummaryResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [preset, setPreset] = useState<'today' | 'week' | 'month' | 'custom'>('today');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await ownerApiClient.getDashboardSummary({
        branchId: selectedBranchId === 'ALL' ? undefined : selectedBranchId,
        preset: preset === 'custom' ? undefined : preset,
        startDate: preset === 'custom' && customStart ? new Date(customStart).toISOString() : undefined,
        endDate: preset === 'custom' && customEnd ? new Date(customEnd).toISOString() : undefined,
      });

      if (res.success) {
        setData(res.data);
      } else {
        setError(res.error.message || 'Failed to fetch dashboard summary');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [selectedBranchId, preset, customStart, customEnd]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const allAlertsCount =
    (data?.inventoryAlerts.lowStockProducts.length ?? 0) +
    (data?.inventoryAlerts.lowStockRawMaterials.length ?? 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Controls Bar: Branch & Date Range */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          background: '#ffffff',
          padding: '1.25rem 1.5rem',
          borderRadius: '1rem',
          border: '1px solid #f4d3dd',
          boxShadow: '0 4px 16px -6px rgba(120, 20, 60, 0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800, fontSize: '0.875rem', color: '#6f5569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Branch:
          </span>
          <select
            value={selectedBranchId}
            onChange={(e) => onBranchChange(e.target.value)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '9999px',
              border: '1.5px solid #f4d3dd',
              background: '#fff1f4',
              color: '#2b1233',
              fontWeight: 700,
              fontSize: '0.875rem',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="ALL">🏢 All Branches (Aggregated)</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.code})
              </option>
            ))}
          </select>
        </div>

        {/* Date presets */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {(['today', 'week', 'month', 'custom'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              style={{
                padding: '0.45rem 1rem',
                borderRadius: '9999px',
                border: preset === p ? 'none' : '1px solid #f4d3dd',
                background: preset === p ? '#d61c5d' : '#ffffff',
                color: preset === p ? '#ffffff' : '#6f5569',
                fontWeight: 700,
                fontSize: '0.8125rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}

          {preset === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                style={{
                  padding: '0.4rem 0.6rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #f4d3dd',
                  fontSize: '0.8125rem',
                }}
              />
              <span style={{ color: '#6f5569' }}>to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                style={{
                  padding: '0.4rem 0.6rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #f4d3dd',
                  fontSize: '0.8125rem',
                }}
              />
            </div>
          )}

          <button
            type="button"
            onClick={fetchSummary}
            disabled={loading}
            style={{
              padding: '0.45rem 0.9rem',
              borderRadius: '9999px',
              border: '1px solid #f4d3dd',
              background: '#ffffff',
              color: '#d61c5d',
              fontWeight: 700,
              fontSize: '0.8125rem',
              cursor: 'pointer',
            }}
          >
            {loading ? 'Refreshing...' : '🔄 Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '1rem',
            background: '#ffe5e5',
            border: '1px solid #ff9999',
            borderRadius: '0.75rem',
            color: '#a3134a',
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}

      {/* KPI Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
        }}
      >
        <div
          style={{
            background: '#ffffff',
            padding: '1.25rem',
            borderRadius: '1rem',
            border: '1px solid #f4d3dd',
            boxShadow: '0 4px 12px -4px rgba(120, 20, 60, 0.08)',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', textTransform: 'uppercase' }}>
            Total Revenue
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#d61c5d', marginTop: '0.25rem' }}>
            ₹{data?.metrics.revenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '0.00'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#8c7086', marginTop: '0.25rem' }}>
            Excludes cancelled & expired
          </div>
        </div>

        <div
          style={{
            background: '#ffffff',
            padding: '1.25rem',
            borderRadius: '1rem',
            border: '1px solid #f4d3dd',
            boxShadow: '0 4px 12px -4px rgba(120, 20, 60, 0.08)',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', textTransform: 'uppercase' }}>
            Total Orders
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#2b1233', marginTop: '0.25rem' }}>
            {data?.metrics.totalOrders ?? 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#8c7086', marginTop: '0.25rem' }}>
            All placed in period
          </div>
        </div>

        <div
          style={{
            background: '#ffffff',
            padding: '1.25rem',
            borderRadius: '1rem',
            border: '1px solid #f4d3dd',
            boxShadow: '0 4px 12px -4px rgba(120, 20, 60, 0.08)',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', textTransform: 'uppercase' }}>
            Average Order Value
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#2b1233', marginTop: '0.25rem' }}>
            ₹{data?.metrics.averageOrderValue.toFixed(2) ?? '0.00'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#8c7086', marginTop: '0.25rem' }}>
            Revenue / Eligible Orders
          </div>
        </div>

        <div
          style={{
            background: '#ffffff',
            padding: '1.25rem',
            borderRadius: '1rem',
            border: '1px solid #f4d3dd',
            boxShadow: '0 4px 12px -4px rgba(120, 20, 60, 0.08)',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', textTransform: 'uppercase' }}>
            Completed Orders
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0d7d4d', marginTop: '0.25rem' }}>
            {data?.metrics.completedOrders ?? 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#8c7086', marginTop: '0.25rem' }}>
            Fulfilled & handed over
          </div>
        </div>

        <div
          style={{
            background: '#ffffff',
            padding: '1.25rem',
            borderRadius: '1rem',
            border: '1px solid #f4d3dd',
            boxShadow: '0 4px 12px -4px rgba(120, 20, 60, 0.08)',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', textTransform: 'uppercase' }}>
            Cancelled / Expired
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#c0392b', marginTop: '0.25rem' }}>
            {(data?.metrics.cancelledOrders ?? 0) + (data?.metrics.expiredOrders ?? 0)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#8c7086', marginTop: '0.25rem' }}>
            {data?.metrics.cancelledOrders ?? 0} cancelled, {data?.metrics.expiredOrders ?? 0} expired
          </div>
        </div>
      </div>

      {/* Two Column Layout: Status Distribution & Stock Alerts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '1.5rem' }}>
        {/* Order Status Breakdown */}
        <div
          style={{
            background: '#ffffff',
            padding: '1.5rem',
            borderRadius: '1rem',
            border: '1px solid #f4d3dd',
            boxShadow: '0 4px 12px -4px rgba(120, 20, 60, 0.08)',
          }}
        >
          <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#2b1233', marginBottom: '1rem' }}>
            📊 Order Status Distribution
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[
              { label: 'Completed', count: data?.metrics.completedOrders ?? 0, color: '#0d7d4d' },
              { label: 'Confirmed', count: data?.metrics.confirmedOrders ?? 0, color: '#004085' },
              { label: 'Pending Payment', count: data?.metrics.pendingOrders ?? 0, color: '#856404' },
              { label: 'Cancelled', count: data?.metrics.cancelledOrders ?? 0, color: '#721c24' },
              { label: 'Expired', count: data?.metrics.expiredOrders ?? 0, color: '#383d41' },
            ].map((st) => (
              <div
                key={st.label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.5rem 0.75rem',
                  background: '#fff9fa',
                  borderRadius: '0.5rem',
                  border: '1px solid #fceef2',
                }}
              >
                <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#2b1233' }}>{st.label}</span>
                <span
                  style={{
                    background: '#ffc2d4',
                    color: '#2b1233',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                  }}
                >
                  {st.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Low Stock & Inventory Alerts */}
        <div
          style={{
            background: '#ffffff',
            padding: '1.5rem',
            borderRadius: '1rem',
            border: '1px solid #f4d3dd',
            boxShadow: '0 4px 12px -4px rgba(120, 20, 60, 0.08)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#2b1233' }}>
              ⚠️ Stock & Expiry Alerts
            </h3>
            {allAlertsCount > 0 && (
              <span
                style={{
                  background: '#ffe5e5',
                  color: '#c0392b',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  padding: '0.2rem 0.6rem',
                  borderRadius: '9999px',
                }}
              >
                {allAlertsCount} Critical
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '240px', overflowY: 'auto' }}>
            {allAlertsCount > 0 ? (
              <>
                {data?.inventoryAlerts.lowStockRawMaterials.map((mat) => (
                  <div
                    key={mat.materialId}
                    style={{
                      padding: '0.75rem',
                      background: '#fff5f5',
                      border: '1px solid #fcd5d5',
                      borderRadius: '0.5rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#2b1233' }}>
                        {mat.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#c0392b' }}>
                        Current: {mat.quantity} {mat.unit} (Min: {mat.reorderThreshold} {mat.unit})
                      </div>
                    </div>
                    <span
                      style={{
                        background: '#c0392b',
                        color: '#ffffff',
                        fontSize: '0.6875rem',
                        fontWeight: 800,
                        padding: '0.2rem 0.5rem',
                        borderRadius: '0.25rem',
                      }}
                    >
                      RAW MATERIAL
                    </span>
                  </div>
                ))}

                {data?.inventoryAlerts.lowStockProducts.map((prod) => (
                  <div
                    key={prod.productId}
                    style={{
                      padding: '0.75rem',
                      background: '#fff5f5',
                      border: '1px solid #fcd5d5',
                      borderRadius: '0.5rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#2b1233' }}>
                        {prod.productName}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#c0392b' }}>
                        Current: {prod.quantity} (Min: {prod.reorderThreshold})
                      </div>
                    </div>
                    <span
                      style={{
                        background: '#e67e22',
                        color: '#ffffff',
                        fontSize: '0.6875rem',
                        fontWeight: 800,
                        padding: '0.2rem 0.5rem',
                        borderRadius: '0.25rem',
                      }}
                    >
                      FINISHED ITEM
                    </span>
                  </div>
                ))}
              </>
            ) : (
              <div style={{ color: '#0d7d4d', fontSize: '0.875rem', padding: '1rem', textAlign: 'center' }}>
                ✅ All inventory items are currently above safety thresholds.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Two Column Layout: Top Products & Promotion Counts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '1.5rem' }}>
        {/* Top Selling Products */}
        <div
          style={{
            background: '#ffffff',
            padding: '1.5rem',
            borderRadius: '1rem',
            border: '1px solid #f4d3dd',
            boxShadow: '0 4px 12px -4px rgba(120, 20, 60, 0.08)',
          }}
        >
          <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#2b1233', marginBottom: '1rem' }}>
            🍨 Top Selling Products
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {data && data.topProducts.length > 0 ? (
              data.topProducts.map((p, idx) => (
                <div
                  key={p.productId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.6rem 0.75rem',
                    background: '#fff9fa',
                    borderRadius: '0.5rem',
                    border: '1px solid #fceef2',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontWeight: 800, color: '#d61c5d', width: '1.5rem' }}>#{idx + 1}</span>
                    <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#2b1233' }}>{p.productName}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontSize: '0.875rem', color: '#2b1233' }}>
                      {p.quantitySold} sold
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#6f5569' }}>
                      ₹{p.revenue.toFixed(2)}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ color: '#8c7086', fontSize: '0.875rem' }}>No product sales recorded in this period.</div>
            )}
          </div>
        </div>

        {/* Promotion Usage */}
        <div
          style={{
            background: '#ffffff',
            padding: '1.5rem',
            borderRadius: '1rem',
            border: '1px solid #f4d3dd',
            boxShadow: '0 4px 12px -4px rgba(120, 20, 60, 0.08)',
          }}
        >
          <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#2b1233', marginBottom: '1rem' }}>
            🏷️ Promotion & Coupon Redemptions
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem',
                background: '#fff9fa',
                borderRadius: '0.5rem',
                border: '1px solid #fceef2',
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#2b1233' }}>
                  Coupon Redemptions
                </div>
                <span style={{ fontSize: '0.75rem', color: '#6f5569' }}>
                  Checkout discount coupons applied
                </span>
              </div>
              <span
                style={{
                  background: '#ffc2d4',
                  color: '#2b1233',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  fontWeight: 800,
                  fontSize: '0.875rem',
                }}
              >
                {data?.promotions.couponUsageCount ?? 0}
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem',
                background: '#fff9fa',
                borderRadius: '0.5rem',
                border: '1px solid #fceef2',
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#2b1233' }}>
                  Automatic Offers Applied
                </div>
                <span style={{ fontSize: '0.75rem', color: '#6f5569' }}>
                  Catalog-level branch deals triggered
                </span>
              </div>
              <span
                style={{
                  background: '#ffc2d4',
                  color: '#2b1233',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  fontWeight: 800,
                  fontSize: '0.875rem',
                }}
              >
                {data?.promotions.offerUsageCount ?? 0}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
