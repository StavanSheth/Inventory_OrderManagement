'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface BunMobileNavProps {
  currentPortal?: 'customer' | 'operator' | 'owner' | 'home';
  currentTab?: string;
  onTabChange?: (tab: string) => void;
  tabItems?: Array<{ id: string; label: string; icon: string; count?: number }>;
  branchName?: string;
}

/**
 * BunMobileNav: Touch-first expandable navigation inspired by the reference bun concept.
 * Floats unobtrusively in the bottom-right corner with safe-area padding.
 * Expands into a polished, responsive action panel with portal & tab switching.
 */
export default function BunMobileNav({
  currentPortal: _currentPortal = 'customer',
  currentTab,
  onTabChange,
  tabItems = [],
  branchName,
}: BunMobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Close on route change
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  const portals = [
    { href: '/order', label: 'Menu', icon: '🍨', active: pathname.startsWith('/order') },
    { href: '/operator', label: 'Operator', icon: '📋', active: pathname.startsWith('/operator') },
    { href: '/owner', label: 'Owner', icon: '👑', active: pathname.startsWith('/owner') },
    { href: '/', label: 'Home', icon: '✨', active: pathname === '/' },
  ];

  return (
    <div className="md:hidden">
      {/* Tap-outside Backdrop */}
      {isOpen && (
        <div
          className="bun-panel-backdrop"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Floating Bun Menu Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className="bun-panel"
          role="dialog"
          aria-label="Mobile Navigation Menu"
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem', paddingBottom: '0.65rem', borderBottom: '1px solid #f4d3dd' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <span style={{ fontSize: '1.25rem' }}>🍦</span>
              <span style={{ fontFamily: 'var(--font-display-family)', fontWeight: 800, fontSize: '1.05rem', color: '#d61c5d' }}>
                MELT MENU
              </span>
            </div>
            {branchName && (
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6f5569', background: '#fff1f4', padding: '0.2rem 0.55rem', borderRadius: '9999px', border: '1px solid #f4d3dd' }}>
                📍 {branchName}
              </span>
            )}
          </div>

          {/* Contextual Page Tabs (if present on current view) */}
          {tabItems.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6f5569', marginBottom: '0.4rem' }}>
                Page Views
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.4rem' }}>
                {tabItems.map((tab) => {
                  const isActive = currentTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        onTabChange?.(tab.id);
                        setIsOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '0.85rem',
                        border: isActive ? '1px solid #d61c5d' : '1px solid #f4d3dd',
                        background: isActive ? '#fff1f4' : '#ffffff',
                        color: isActive ? '#d61c5d' : '#2b1233',
                        fontWeight: isActive ? 800 : 700,
                        fontSize: '0.8125rem',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>{tab.icon}</span>
                        <span>{tab.label}</span>
                      </span>
                      {typeof tab.count === 'number' && tab.count > 0 && (
                        <span style={{ background: '#ffcf4d', color: '#2b1233', fontSize: '0.7rem', fontWeight: 900, padding: '0.05rem 0.35rem', borderRadius: '9999px' }}>
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Portals Switcher */}
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6f5569', marginBottom: '0.4rem' }}>
              Switch Portals
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.4rem' }}>
              {portals.map((p) => (
                <Link
                  key={p.href}
                  href={p.href}
                  onClick={() => setIsOpen(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    padding: '0.55rem 0.75rem',
                    borderRadius: '0.85rem',
                    border: p.active ? '1px solid #d61c5d' : '1px solid #f4d3dd',
                    background: p.active ? '#d61c5d' : '#ffffff',
                    color: p.active ? '#ffffff' : '#2b1233',
                    textDecoration: 'none',
                    fontWeight: 800,
                    fontSize: '0.8125rem',
                    boxShadow: p.active ? '0 2px 8px rgba(214, 28, 93, 0.25)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{ fontSize: '1rem' }}>{p.icon}</span>
                  <span>{p.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Floating Bun Trigger Button */}
      <button
        type="button"
        className="bun-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Close navigation menu' : 'Open quick navigation menu'}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>{isOpen ? '✕' : '🍔'}</span>
          <span>{isOpen ? 'Close' : 'Menu'}</span>
        </span>
      </button>
    </div>
  );
}
