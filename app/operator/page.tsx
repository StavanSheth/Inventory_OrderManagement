'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { OperatorQueueView } from '@/frontend/modules/orders';
import { OperatorInventoryView } from '@/frontend/modules/inventory';
import { OperatorPromotionsView } from '@/frontend/modules/promotions';
import { useAuth } from '@/frontend/modules/auth/auth-hooks';
import { UserRole } from '@/shared/enums/roles.enum';

type TabType = 'orders' | 'inventory' | 'promotions';

export default function OperatorPortalPage() {
  const [branches, setBranches] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [branchId, setBranchId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabType>('orders');

  let authContext: ReturnType<typeof useAuth> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    authContext = useAuth();
  } catch {
    // Safe fallback if rendered outside AuthProvider
  }

  // Load available active branches from backend API
  useEffect(() => {
    fetch('/api/v1/branches')
      .then((res) => res.json() as Promise<{ success?: boolean; data?: Array<{ id: string; name: string; code: string }> }>)
      .then((json) => {
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          setBranches(json.data);

          // If operator has specific branch membership, derive authoritative branch
          if (authContext?.user?.role === UserRole.BRANCH_OPERATOR) {
            const opBranch = authContext.memberships.find((m) => m.role === UserRole.BRANCH_OPERATOR)?.branchId
              ?? authContext.activeBranchId;
            if (opBranch) {
              setBranchId(opBranch);
              return;
            }
          }

          // Otherwise default to first available branch
          setBranchId((prev) => (prev ? prev : json.data![0].id));
        }
      })
      .catch(() => {});
  }, [authContext]);

  return (
    <div style={{ minHeight: '100vh', background: '#fff1f4', color: '#2b1233', fontFamily: 'var(--font-body-family), system-ui, sans-serif' }}>
      {/* Operator Header Bar */}
      <header
        style={{
          borderBottom: '1px solid #f4d3dd',
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(16px)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          padding: '0.85rem 1.5rem',
          boxShadow: '0 10px 25px -12px rgba(120, 20, 60, 0.12)',
        }}
      >
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <Link href="/" style={{ textDecoration: 'none', color: '#2b1233', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.5rem' }}>🍦</span>
              <span style={{ fontFamily: 'var(--font-display-family)', fontWeight: 700, fontSize: '1.25rem', color: '#d61c5d' }}>
                MELT DESK
              </span>
            </Link>

            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 800,
                padding: '0.3rem 0.8rem',
                borderRadius: '9999px',
                background: '#ffc2d4',
                color: '#2b1233',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Operator & Reception Desk
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {/* Branch Switcher */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#ffffff', border: '1px solid #f4d3dd', padding: '0.4rem 0.9rem', borderRadius: '9999px', boxShadow: '0 2px 8px -4px rgba(120,20,60,0.1)' }}>
              <span style={{ fontSize: '0.75rem', color: '#6f5569', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800 }}>Branch:</span>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                disabled={authContext?.user?.role === UserRole.BRANCH_OPERATOR && authContext.memberships.length === 1}
                style={{
                  background: 'transparent',
                  color: '#2b1233',
                  border: 'none',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {branches.length > 0 ? (
                  branches.map((b) => (
                    <option key={b.id} value={b.id} style={{ background: '#ffffff', color: '#2b1233' }}>
                      {b.name} ({b.code})
                    </option>
                  ))
                ) : (
                  <option value={branchId} style={{ background: '#ffffff', color: '#2b1233' }}>
                    Select Branch
                  </option>
                )}
              </select>
            </div>

            <Link
              href="/order"
              style={{
                padding: '0.45rem 1rem',
                borderRadius: '9999px',
                border: '1px solid #f4d3dd',
                background: '#ffffff',
                color: '#2b1233',
                textDecoration: 'none',
                fontSize: '0.8125rem',
                fontWeight: 700,
                boxShadow: '0 2px 8px -4px rgba(120,20,60,0.1)',
                transition: 'all 0.15s ease',
              }}
            >
              Customer Store &rarr;
            </Link>
          </div>
        </div>
      </header>

      {/* Navigation Sub-header / Tab Bar */}
      <nav
        style={{
          borderBottom: '1px solid #f4d3dd',
          background: '#ffffff',
          padding: '0.5rem 1.5rem',
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            display: 'flex',
            gap: '0.5rem',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            style={{
              padding: '0.55rem 1.15rem',
              background: activeTab === 'orders' ? '#d61c5d' : 'transparent',
              border: activeTab === 'orders' ? 'none' : '1px solid transparent',
              borderRadius: '9999px',
              color: activeTab === 'orders' ? '#ffffff' : '#6f5569',
              fontWeight: 800,
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: activeTab === 'orders' ? '0 3px 0 #a3134a' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <span>📋</span>
            <span>Live Orders</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('inventory')}
            style={{
              padding: '0.55rem 1.15rem',
              background: activeTab === 'inventory' ? '#d61c5d' : 'transparent',
              border: activeTab === 'inventory' ? 'none' : '1px solid transparent',
              borderRadius: '9999px',
              color: activeTab === 'inventory' ? '#ffffff' : '#6f5569',
              fontWeight: 800,
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: activeTab === 'inventory' ? '0 3px 0 #a3134a' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <span>📦</span>
            <span>Inventory & Stock</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('promotions')}
            style={{
              padding: '0.55rem 1.15rem',
              background: activeTab === 'promotions' ? '#d61c5d' : 'transparent',
              border: activeTab === 'promotions' ? 'none' : '1px solid transparent',
              borderRadius: '9999px',
              color: activeTab === 'promotions' ? '#ffffff' : '#6f5569',
              fontWeight: 800,
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: activeTab === 'promotions' ? '0 3px 0 #a3134a' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <span>🏷️</span>
            <span>Promotions & Coupons</span>
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>
        {branchId ? (
          <>
            {activeTab === 'orders' && <OperatorQueueView branchId={branchId} />}
            {activeTab === 'inventory' && <OperatorInventoryView branchId={branchId} />}
            {activeTab === 'promotions' && <OperatorPromotionsView branchId={branchId} />}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6f5569', fontWeight: 700 }}>Loading branch context...</div>
        )}
      </main>
    </div>
  );
}
