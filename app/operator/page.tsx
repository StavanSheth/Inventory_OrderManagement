'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { OperatorQueueView } from '@/frontend/modules/orders';

export default function OperatorPortalPage() {
  const [branchId, setBranchId] = useState<string>('branch-alpha');

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
            {/* Branch Switcher */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#1e293b', padding: '0.35rem 0.75rem', borderRadius: '8px' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Branch:</span>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
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
                <option value="branch-alpha" style={{ background: '#1e293b', color: '#fff' }}>Branch Alpha (Main)</option>
                <option value="branch-beta" style={{ background: '#1e293b', color: '#fff' }}>Branch Beta (Downtown)</option>
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
        <OperatorQueueView branchId={branchId} />
      </main>
    </div>
  );
}
