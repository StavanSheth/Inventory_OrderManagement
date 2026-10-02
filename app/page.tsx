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
          gap: '0.65rem',
          alignItems: 'center',
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(16px)',
          border: '1px solid #f4d3dd',
          borderRadius: '9999px',
          padding: '0.35rem 0.5rem 0.35rem 1rem',
          boxShadow: '0 14px 40px -16px rgba(120, 20, 60, 0.35)',
        }}
      >
        <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#2b1233', fontFamily: 'var(--font-display-family)' }}>
          Order Desk:
        </span>
        <Link
          href="/order"
          style={{
            padding: '0.45rem 1rem',
            background: '#d61c5d',
            color: '#ffffff',
            borderRadius: '9999px',
            textDecoration: 'none',
            fontSize: '0.8125rem',
            fontWeight: 800,
            boxShadow: '0 3px 0 #a3134a',
            transition: 'all 0.15s ease',
          }}
        >
          🍦 Order Online
        </Link>
        <Link
          href="/operator"
          style={{
            padding: '0.45rem 0.95rem',
            background: '#fff1f4',
            border: '1px solid #f4d3dd',
            color: '#2b1233',
            borderRadius: '9999px',
            textDecoration: 'none',
            fontSize: '0.8125rem',
            fontWeight: 700,
            transition: 'all 0.15s ease',
          }}
        >
          📋 Operator Desk
        </Link>
      </div>

      <SitePage />
    </AppShell>
  );
}
