'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { OwnerDashboardView } from '@/frontend/modules/dashboard';
import { UnifiedOrderHistoryView, OperatorQueueView } from '@/frontend/modules/orders';
import { BranchManagementView } from '@/frontend/modules/branches';
import { BranchSettingsView, DataManagementView } from '@/frontend/modules/settings';
import { UnifiedLedgerView } from '@/frontend/modules/ledger';
import { OperatorInventoryView } from '@/frontend/modules/inventory';
import { OwnerMessagingView } from '@/frontend/modules/marketing';
import { Branch } from '@/shared/types/entities.types';
import { GlobalNavigation, BunMobileNav } from '@/frontend/components/ui';

type OwnerTab =
  | 'dashboard'
  | 'queue'
  | 'orders'
  | 'inventory'
  | 'branches'
  | 'ledger'
  | 'settings'
  | 'data'
  | 'marketing';

export default function OwnerPortalPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<OwnerTab>('dashboard');
  const [loadingBranches, setLoadingBranches] = useState<boolean>(true);

  const fetchBranches = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/branches');
      const json = (await res.json()) as { success?: boolean; data?: Branch[] };
      if (json.success && Array.isArray(json.data)) {
        setBranches(json.data);
      }
    } catch {
      // fallback
    } finally {
      setLoadingBranches(false);
    }
  }, []);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  const handleSelectBranchSettings = (branchId: string) => {
    setSelectedBranchId(branchId);
    setActiveTab('settings');
  };

  const branchOptions = [
    { id: 'ALL', name: 'All Branches (Enterprise)', code: 'GLOBAL' },
    ...branches.map((b) => ({ id: b.id, name: b.name, code: b.code })),
  ];

  const currentBranchName = selectedBranchId === 'ALL'
    ? 'All Branches'
    : (branches.find((b) => b.id === selectedBranchId)?.name ?? 'Branch');

  const tabItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'queue', label: 'Order Queue', icon: '🛎️' },
    { id: 'orders', label: 'History', icon: '📜' },
    { id: 'inventory', label: 'Inventory', icon: '📦' },
    { id: 'branches', label: 'Branches', icon: '🏢' },
    { id: 'ledger', label: 'Ledger', icon: '📑' },
    { id: 'marketing', label: 'Broadcast & Messages', icon: '📢' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
    { id: 'data', label: 'Data', icon: '🛡️' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#fff1f4', color: '#2b1233', fontFamily: 'var(--font-body-family), system-ui, sans-serif' }}>
      {/* Global Navigation Header */}
      <GlobalNavigation
        portalTitle="Owner Portal"
        portalSubtitle="Enterprise Analytics & Controls"
        branches={branchOptions}
        selectedBranchId={selectedBranchId}
        onBranchChange={setSelectedBranchId}
      >
        <Link
          href="/operator"
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
          Staff Desk &rarr;
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
          className="app-container no-scrollbar"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          <div className="no-scrollbar" style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {tabItems.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as OwnerTab)}
                  style={{
                    padding: '0.4rem 0.95rem',
                    background: isActive ? '#d61c5d' : 'transparent',
                    border: 'none',
                    borderRadius: '9999px',
                    color: isActive ? '#ffffff' : '#6f5569',
                    fontWeight: 800,
                    fontSize: '0.825rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    boxShadow: isActive ? '0 2px 0 #a3134a' : 'none',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs font-bold text-gray-500">
            <span>Scope:</span>
            <span className="text-gray-900 bg-white px-2.5 py-1 rounded-full border border-pink-100 shadow-xs">
              {currentBranchName}
            </span>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="app-container" style={{ paddingTop: '1.75rem', paddingBottom: '5rem' }}>
        {loadingBranches ? (
          <div className="app-card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem', color: '#6f5569' }}>
            <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.75rem' }}>👑</span>
            <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#2b1233' }}>Loading Enterprise Workspace...</span>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <OwnerDashboardView
                branches={branches}
                selectedBranchId={selectedBranchId}
                onBranchChange={setSelectedBranchId}
              />
            )}
            {activeTab === 'queue' && (
              <div>
                {selectedBranchId === 'ALL' && branches.length > 0 && (
                  <div
                    style={{
                      marginBottom: '1rem',
                      padding: '0.75rem 1.25rem',
                      background: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      borderRadius: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      color: '#1e40af',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                    }}
                  >
                    <span>
                      📍 Viewing live queue for default branch: <strong style={{ color: '#1e3a8a' }}>{branches[0].name}</strong>.
                      Select a specific branch in the header to switch branches.
                    </span>
                  </div>
                )}
                <OperatorQueueView
                  branchId={selectedBranchId === 'ALL' && branches[0] ? branches[0].id : selectedBranchId}
                  isOwner={true}
                />
              </div>
            )}
            {activeTab === 'orders' && (
              <UnifiedOrderHistoryView
                branches={branches}
                defaultBranchId={selectedBranchId}
                isOwner={true}
              />
            )}
            {activeTab === 'inventory' && (
              <OperatorInventoryView
                branchId={selectedBranchId === 'ALL' && branches[0] ? branches[0].id : selectedBranchId}
                isOwner={true}
              />
            )}
            {activeTab === 'branches' && (
              <BranchManagementView
                branches={branches}
                onBranchesUpdated={fetchBranches}
                onSelectBranchSettings={handleSelectBranchSettings}
              />
            )}
            {activeTab === 'ledger' && (
              <UnifiedLedgerView
                branchId={selectedBranchId === 'ALL' && branches[0] ? branches[0].id : selectedBranchId}
                isOwner={true}
              />
            )}
            {activeTab === 'marketing' && (
              <OwnerMessagingView
                branches={branches}
                selectedBranchId={selectedBranchId}
              />
            )}
            {activeTab === 'settings' && (
              <BranchSettingsView
                branches={branches}
                selectedBranchId={selectedBranchId === 'ALL' && branches[0] ? branches[0].id : selectedBranchId}
                onBranchChange={setSelectedBranchId}
              />
            )}
            {activeTab === 'data' && (
              <DataManagementView
                branches={branches}
                onBranchesUpdated={fetchBranches}
              />
            )}
          </>
        )}
      </main>

      {/* Bun Mobile Navigation */}
      <BunMobileNav
        currentPortal="owner"
        currentTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as OwnerTab)}
        tabItems={tabItems}
        branchName={currentBranchName}
      />
    </div>
  );
}
