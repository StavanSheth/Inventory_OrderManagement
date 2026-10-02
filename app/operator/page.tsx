'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { OperatorQueueView } from '@/frontend/modules/orders';
import { OperatorInventoryView } from '@/frontend/modules/inventory';
import { OperatorPromotionsView } from '@/frontend/modules/promotions';
import { UnifiedLedgerView } from '@/frontend/modules/ledger';
import { useAuth } from '@/frontend/modules/auth/auth-hooks';
import { UserRole } from '@/shared/enums/roles.enum';
import { GlobalNavigation, BunMobileNav } from '@/frontend/components/ui';

type TabType = 'orders' | 'inventory' | 'promotions' | 'ledger';

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

          let initialBranch = json.data[0].id;
          if (typeof window !== 'undefined') {
            const urlParams = new URLSearchParams(window.location.search);
            const branchQuery = urlParams.get('branch')?.toLowerCase();
            if (branchQuery) {
              const matched = json.data.find(
                (b) => b.code.toLowerCase() === branchQuery || b.id.toLowerCase() === branchQuery,
              );
              if (matched) {
                initialBranch = matched.id;
              }
            }
          }

          // Otherwise default to resolved branch
          setBranchId((prev) => (prev ? prev : initialBranch));
        }
      })
      .catch(() => {});
  }, [authContext]);

  const selectedBranch = branches.find((b) => b.id === branchId);

  const tabItems = [
    { id: 'orders', label: 'Live Orders', icon: '📋' },
    { id: 'inventory', label: 'Inventory', icon: '📦' },
    { id: 'promotions', label: 'Promotions', icon: '🏷️' },
    { id: 'ledger', label: 'Ledger', icon: '📑' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#fff1f4', color: '#2b1233', fontFamily: 'var(--font-body-family), system-ui, sans-serif' }}>
      {/* Global Navigation Header */}
      <GlobalNavigation
        portalTitle="Operator Desk"
        portalSubtitle="Reception & Fulfillment Queue"
        branches={branches}
        selectedBranchId={branchId}
        onBranchChange={setBranchId}
        branchDisabled={authContext?.user?.role === UserRole.BRANCH_OPERATOR && authContext.memberships.length === 1}
      >
        <Link
          href="/order"
          className="hidden md:inline-flex"
          style={{
            padding: '0.4rem 0.85rem',
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
          Customer Menu &rarr;
        </Link>
      </GlobalNavigation>

      {/* Navigation Sub-header / Tab Bar */}
      <nav
        style={{
          borderBottom: '1px solid #f4d3dd',
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(12px)',
          padding: '0.65rem 0',
          position: 'sticky',
          top: '57px',
          zIndex: 90,
        }}
      >
        <div
          className="app-container"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            overflowX: 'auto',
          }}
        >
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {tabItems.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as TabType)}
                  style={{
                    padding: '0.45rem 1.15rem',
                    background: isActive ? '#d61c5d' : 'transparent',
                    border: 'none',
                    borderRadius: '9999px',
                    color: isActive ? '#ffffff' : '#6f5569',
                    fontWeight: 800,
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    boxShadow: isActive ? '0 3px 0 #a3134a' : 'none',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs font-bold text-gray-500">
            <span>Branch Station:</span>
            <span className="text-gray-900 bg-white px-2.5 py-1 rounded-full border border-pink-100 shadow-xs">
              {selectedBranch?.name ?? 'Loading...'}
            </span>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="app-container" style={{ paddingTop: '1.75rem', paddingBottom: '5rem' }}>
        {branchId ? (
          <>
            {activeTab === 'orders' && <OperatorQueueView branchId={branchId} />}
            {activeTab === 'inventory' && <OperatorInventoryView branchId={branchId} />}
            {activeTab === 'promotions' && <OperatorPromotionsView branchId={branchId} />}
            {activeTab === 'ledger' && <UnifiedLedgerView branchId={branchId} />}
          </>
        ) : (
          <div className="app-card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem', color: '#6f5569' }}>
            <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.75rem' }}>⏳</span>
            <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#2b1233' }}>Loading Branch Operations...</span>
          </div>
        )}
      </main>

      {/* Bun Mobile Navigation */}
      <BunMobileNav
        currentPortal="operator"
        currentTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as TabType)}
        tabItems={tabItems}
        branchName={selectedBranch?.name}
      />
    </div>
  );
}
