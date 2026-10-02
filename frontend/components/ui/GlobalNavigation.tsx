'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface GlobalNavigationProps {
  portalTitle: string;
  portalSubtitle?: string;
  branches?: Array<{ id: string; name: string; code: string }>;
  selectedBranchId?: string;
  onBranchChange?: (branchId: string) => void;
  branchDisabled?: boolean;
  cartCount?: number;
  children?: React.ReactNode;
}

export default function GlobalNavigation({
  portalTitle,
  portalSubtitle,
  branches = [],
  selectedBranchId,
  onBranchChange,
  branchDisabled = false,
  cartCount = 0,
  children,
}: GlobalNavigationProps) {
  const pathname = usePathname();

  const isCustomer = pathname.startsWith('/order');
  const isOperator = pathname.startsWith('/operator');
  const isOwner = pathname.startsWith('/owner');

  return (
    <header
      style={{
        borderBottom: '1px solid #f4d3dd',
        background: 'rgba(255, 255, 255, 0.96)',
        backdropFilter: 'blur(20px)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 8px 30px -12px rgba(120, 20, 60, 0.1)',
      }}
    >
      <div
        className="app-container"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: '0.75rem',
          paddingBottom: '0.75rem',
          gap: '1rem',
        }}
      >
        {/* Brand & Portal Context */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <Link
            href="/"
            style={{
              textDecoration: 'none',
              color: '#2b1233',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              outline: 'none',
            }}
          >
            <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>🍦</span>
            <div>
              <span
                style={{
                  fontFamily: 'var(--font-display-family)',
                  fontWeight: 900,
                  fontSize: '1.25rem',
                  letterSpacing: '-0.02em',
                  color: '#d61c5d',
                  display: 'block',
                  lineHeight: 1.1,
                }}
              >
                MELT
              </span>
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: '#6f5569',
                }}
              >
                {portalTitle}
              </span>
            </div>
          </Link>

          {portalSubtitle && (
            <span
              className="hidden lg:inline-flex"
              style={{
                fontSize: '0.75rem',
                fontWeight: 800,
                padding: '0.25rem 0.75rem',
                borderRadius: '9999px',
                background: '#fff1f4',
                border: '1px solid #f4d3dd',
                color: '#6f5569',
              }}
            >
              {portalSubtitle}
            </span>
          )}

          {/* Branch Picker (when applicable) */}
          {branches.length > 0 && selectedBranchId !== undefined && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: '#ffffff',
                border: '1px solid #f4d3dd',
                padding: '0.3rem 0.75rem',
                borderRadius: '9999px',
                boxShadow: '0 2px 8px -4px rgba(120,20,60,0.1)',
              }}
            >
              <span style={{ fontSize: '0.7rem', color: '#6f5569', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800 }}>
                📍 Branch:
              </span>
              <select
                value={selectedBranchId}
                onChange={(e) => onBranchChange?.(e.target.value)}
                disabled={branchDisabled}
                aria-label="Select active branch"
                style={{
                  background: 'transparent',
                  color: '#2b1233',
                  border: 'none',
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  cursor: branchDisabled ? 'default' : 'pointer',
                  outline: 'none',
                  maxWidth: '180px',
                }}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id} style={{ background: '#ffffff', color: '#2b1233' }}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Portal Switcher & Action Controls (Desktop & Tablet) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* Responsive Portal Quick Switch Tabs */}
          <div
            className="hidden sm:flex"
            style={{
              background: '#fff1f4',
              padding: '0.25rem',
              borderRadius: '9999px',
              border: '1px solid #f4d3dd',
              gap: '0.25rem',
            }}
          >
            <Link
              href="/order"
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '9999px',
                textDecoration: 'none',
                fontSize: '0.8125rem',
                fontWeight: isCustomer ? 800 : 700,
                background: isCustomer ? '#d61c5d' : 'transparent',
                color: isCustomer ? '#ffffff' : '#6f5569',
                boxShadow: isCustomer ? '0 2px 8px rgba(214, 28, 93, 0.3)' : 'none',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <span>🍨 Menu</span>
              {cartCount > 0 && isCustomer && (
                <span style={{ background: '#ffcf4d', color: '#2b1233', fontSize: '0.7rem', fontWeight: 900, borderRadius: '9999px', padding: '0.05rem 0.4rem' }}>
                  {cartCount}
                </span>
              )}
            </Link>

            <Link
              href="/operator"
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '9999px',
                textDecoration: 'none',
                fontSize: '0.8125rem',
                fontWeight: isOperator ? 800 : 700,
                background: isOperator ? '#d61c5d' : 'transparent',
                color: isOperator ? '#ffffff' : '#6f5569',
                boxShadow: isOperator ? '0 2px 8px rgba(214, 28, 93, 0.3)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              📋 Operator
            </Link>

            <Link
              href="/owner"
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '9999px',
                textDecoration: 'none',
                fontSize: '0.8125rem',
                fontWeight: isOwner ? 800 : 700,
                background: isOwner ? '#d61c5d' : 'transparent',
                color: isOwner ? '#ffffff' : '#6f5569',
                boxShadow: isOwner ? '0 2px 8px rgba(214, 28, 93, 0.3)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              👑 Owner
            </Link>
          </div>

          {/* Any page-specific custom actions */}
          {children}
        </div>
      </div>
    </header>
  );
}
