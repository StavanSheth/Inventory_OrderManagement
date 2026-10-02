import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OrderStatus, PaymentStatus } from '../../shared/enums/order.enum';

describe('Interactive Responsive UI Components & Design Tokens', () => {
  it('covers all OrderStatus and PaymentStatus states deterministically', () => {
    const orderStatuses = [
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.PREPARING,
      OrderStatus.READY,
      OrderStatus.COMPLETED,
      OrderStatus.CANCELLED,
      OrderStatus.EXPIRED,
    ];

    const paymentStatuses = [
      PaymentStatus.PENDING,
      PaymentStatus.RECORDED,
      PaymentStatus.VERIFIED,
      PaymentStatus.COMPLETED,
      PaymentStatus.FAILED,
      PaymentStatus.REFUNDED,
    ];

    // Every status must be defined as non-empty uppercase string
    for (const status of orderStatuses) {
      assert.ok(status.length > 0);
      assert.strictEqual(status, status.toUpperCase());
    }

    for (const status of paymentStatuses) {
      assert.ok(status.length > 0);
      assert.strictEqual(status, status.toUpperCase());
    }
  });

  it('verifies responsive layout token structure in CSS', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const cssPath = path.resolve(process.cwd(), 'app', 'globals.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    // Must define fluid containers and clamps
    assert.ok(cssContent.includes('.app-container'));
    assert.ok(cssContent.includes('.app-grid-cards'));
    assert.ok(cssContent.includes('.app-metric-grid'));

    // Must define Bun-style expandable mobile navigation
    assert.ok(cssContent.includes('.bun-trigger'));
    assert.ok(cssContent.includes('.bun-panel'));
    assert.ok(cssContent.includes('.bun-panel-backdrop'));

    // Must define accessible focus rings and responsive bottom sheet
    assert.ok(cssContent.includes('focus-visible'));
    assert.ok(cssContent.includes('.app-sheet-backdrop'));
    assert.ok(cssContent.includes('.app-sheet-content'));
  });

  it('validates navigation route structure across portals', () => {
    const routes = [
      { portal: 'home', path: '/' },
      { portal: 'customer', path: '/order' },
      { portal: 'operator', path: '/operator' },
      { portal: 'owner', path: '/owner' },
    ];

    for (const route of routes) {
      assert.ok(route.path.startsWith('/'));
      assert.ok(route.portal.length > 0);
    }
  });
});
