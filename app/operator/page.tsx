'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { OperatorQueueView } from '@/frontend/modules/orders';
import { useAuth } from '@/frontend/modules/auth/auth-hooks';
import { UserRole } from '@/shared/enums/roles.enum';

export default function OperatorPortalPage() {
  const [branches, setBranches] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [branchId, setBranchId] = useState<string>('');

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
    <div style={{ minHeight: '100vh', background: '#0b1120', color: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
      {/* Operator Header Bar */}
      <header
        style={{
          borderBottom: '1px solid #1e293b',
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          padding: '0.75rem 1.5rem',
        }}
      >
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <Link href="/" style={{ textDecoration: 'none', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.5rem' }}>🍦</span>
              <span style={{ fontWeight: 800, fontSize: '1.15rem', color: '#fbbf24' }}>
                MELT DESK
              </span>
            </Link>

            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '0.2rem 0.5rem',
                borderRadius: '4px',
                background: '#3730a3',
                color: '#c7d2fe',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Operator & Reception Portal
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {/* Branch Switcher (Authoritative for Operator/Owner) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#1e293b', padding: '0.35rem 0.75rem', borderRadius: '8px' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Branch:</span>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                disabled={authContext?.user?.role === UserRole.BRANCH_OPERATOR && authContext.memberships.length === 1}
                style={{
                  background: 'transparent',
                  color: '#f8fafc',
                  border: 'none',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {branches.length > 0 ? (
                  branches.map((b) => (
                    <option key={b.id} value={b.id} style={{ background: '#1e293b', color: '#fff' }}>
                      {b.name} ({b.code})
                    </option>
                  ))
                ) : (
                  <option value={branchId} style={{ background: '#1e293b', color: '#fff' }}>
                    Select Branch
                  </option>
                )}
              </select>
            </div>

            <Link
              href="/order"
              style={{
                padding: '0.4rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid #334155',
                color: '#cbd5e1',
                textDecoration: 'none',
                fontSize: '0.75rem',
                fontWeight: 500,
              }}
            >
              Customer Store &rarr;
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>
        {branchId ? (
          <OperatorQueueView branchId={branchId} />
        ) : (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>Loading branch context...</div>
        )}
      </main>
    </div>
  );
}
