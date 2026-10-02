import Link from 'next/link';
import { AppShell } from '@/frontend/components/ui';
import SitePage from '@/site/Page';
import { meta } from '@/site/site';

/**
 * Route-level composition for root landing page.
 * Strictly presents application shell and presentation view with immediate
 * access to the Phase 3 Customer Ordering and Operator Reception Portals.
 */
export default function Home() {
  return (
    <AppShell
      title={meta.loaderText ?? meta.name}
      enableLoader={meta.loader ?? true}
      enableCursor={meta.cursor !== false}
      recordOptions={meta.record}
    >
      {/* Quick Launch Navigation Banner */}
      <div
        style={{
          position: 'fixed',
          top: '1rem',
          right: '1.5rem',
          zIndex: 9999,
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'center',
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '9999px',
          padding: '0.4rem 0.6rem 0.4rem 1rem',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
        }}
      >
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#e2e8f0' }}>
          Ice Cream Ordering:
        </span>
        <Link
          href="/order"
          style={{
            padding: '0.4rem 0.85rem',
            background: '#2563eb',
            color: '#ffffff',
            borderRadius: '9999px',
            textDecoration: 'none',
            fontSize: '0.8125rem',
            fontWeight: 700,
            transition: 'background 0.15s ease',
          }}
        >
          🍦 Order Online
        </Link>
        <Link
          href="/operator"
          style={{
            padding: '0.4rem 0.85rem',
            background: 'rgba(255, 255, 255, 0.1)',
            color: '#cbd5e1',
            borderRadius: '9999px',
            textDecoration: 'none',
            fontSize: '0.8125rem',
            fontWeight: 600,
          }}
        >
          📋 Operator Desk
        </Link>
      </div>

      <SitePage />
    </AppShell>
  );
}
