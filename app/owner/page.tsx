'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { OwnerDashboardView } from '@/frontend/modules/dashboard';
import { UnifiedOrderHistoryView } from '@/frontend/modules/orders';
import { BranchManagementView } from '@/frontend/modules/branches';
import { BranchSettingsView, DataManagementView } from '@/frontend/modules/settings';
import { Branch } from '@/shared/types/entities.types';

type OwnerTab = 'dashboard' | 'orders' | 'branches' | 'settings' | 'data';

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

  return (
    <div style={{ minHeight: '100vh', background: '#fff1f4', color: '#2b1233', fontFamily: 'var(--font-body-family), system-ui, sans-serif' }}>
      {/* Header Bar */}
      <header
        style={{
          borderBottom: '1px solid #f4d3dd',
          background: 'rgba(255, 255, 255, 0.96)',
          backdropFilter: 'blur(16px)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          padding: '0.85rem 1.5rem',
          boxShadow: '0 10px 25px -12px rgba(120, 20, 60, 0.12)',
        }}
      >
        <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <Link href="/" style={{ textDecoration: 'none', color: '#2b1233', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.5rem' }}>👑</span>
              <span style={{ fontFamily: 'var(--font-display-family)', fontWeight: 800, fontSize: '1.25rem', color: '#d61c5d' }}>
                MELT OWNER
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
              Enterprise Control & Analytics
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link
              href="/operator"
              style={{
                padding: '0.45rem 0.95rem',
                borderRadius: '9999px',
                border: '1px solid #f4d3dd',
                background: '#ffffff',
                color: '#2b1233',
                textDecoration: 'none',
                fontSize: '0.8125rem',
                fontWeight: 700,
                boxShadow: '0 2px 8px -4px rgba(120,20,60,0.1)',
              }}
            >
              📋 Operator Desk
            </Link>

            <Link
              href="/order"
              style={{
                padding: '0.45rem 0.95rem',
                borderRadius: '9999px',
                border: '1px solid #f4d3dd',
                background: '#ffffff',
                color: '#2b1233',
                textDecoration: 'none',
                fontSize: '0.8125rem',
                fontWeight: 700,
                boxShadow: '0 2px 8px -4px rgba(120,20,60,0.1)',
              }}
            >
              🍦 Customer Store
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
            maxWidth: '1280px',
            margin: '0 auto',
            display: 'flex',
            gap: '0.5rem',
            overflowX: 'auto',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            style={{
              padding: '0.55rem 1.15rem',
              background: activeTab === 'dashboard' ? '#d61c5d' : 'transparent',
              border: activeTab === 'dashboard' ? 'none' : '1px solid transparent',
              borderRadius: '9999px',
              color: activeTab === 'dashboard' ? '#ffffff' : '#6f5569',
              fontWeight: 800,
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: activeTab === 'dashboard' ? '0 3px 0 #a3134a' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <span>📊</span>
            <span>Dashboard</span>
          </button>

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
            <span>📜</span>
            <span>Order History</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('branches')}
            style={{
              padding: '0.55rem 1.15rem',
              background: activeTab === 'branches' ? '#d61c5d' : 'transparent',
              border: activeTab === 'branches' ? 'none' : '1px solid transparent',
              borderRadius: '9999px',
              color: activeTab === 'branches' ? '#ffffff' : '#6f5569',
              fontWeight: 800,
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: activeTab === 'branches' ? '0 3px 0 #a3134a' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <span>🏢</span>
            <span>Branch Management</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            style={{
              padding: '0.55rem 1.15rem',
              background: activeTab === 'settings' ? '#d61c5d' : 'transparent',
              border: activeTab === 'settings' ? 'none' : '1px solid transparent',
              borderRadius: '9999px',
              color: activeTab === 'settings' ? '#ffffff' : '#6f5569',
              fontWeight: 800,
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: activeTab === 'settings' ? '0 3px 0 #a3134a' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <span>⚙️</span>
            <span>Branch Settings</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('data')}
            style={{
              padding: '0.55rem 1.15rem',
              background: activeTab === 'data' ? '#d61c5d' : 'transparent',
              border: activeTab === 'data' ? 'none' : '1px solid transparent',
              borderRadius: '9999px',
              color: activeTab === 'data' ? '#ffffff' : '#6f5569',
              fontWeight: 800,
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: activeTab === 'data' ? '0 3px 0 #a3134a' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <span>🛡️</span>
            <span>Data & Privacy</span>
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '1.75rem 1.5rem' }}>
        {loadingBranches ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6f5569', fontWeight: 700 }}>
            Loading enterprise context...
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
            {activeTab === 'orders' && (
              <UnifiedOrderHistoryView
                branches={branches}
                defaultBranchId={selectedBranchId}
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
    </div>
  );
}
