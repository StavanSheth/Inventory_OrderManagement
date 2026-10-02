(process.env as Record<string, string | undefined>).NODE_ENV = 'test';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { middleware } from '../../middleware';

describe('Multi-Tenant Subdomain Routing & Security Boundaries', () => {
  function createReq(url: string, host: string): NextRequest {
    return new NextRequest(url, {
      headers: {
        host,
      },
    });
  }

  describe('1. Owner / Admin Portal Subdomains', () => {
    it('rewrites owner root to /owner with owner role header', () => {
      const req = createReq('http://owner.melt.example.com/', 'owner.melt.example.com');
      const res = middleware(req);
      assert.ok(res);
      const rewriteUrl = res.headers.get('x-middleware-rewrite');
      assert.ok(rewriteUrl?.includes('/owner'));
      assert.strictEqual(res.headers.get('x-portal-role'), 'owner');
      assert.strictEqual(res.headers.get('x-subdomain'), 'owner');
    });

    it('rewrites admin.localhost:3000 root to /owner', () => {
      const req = createReq('http://admin.localhost:3000/', 'admin.localhost:3000');
      const res = middleware(req);
      assert.ok(res);
      const rewriteUrl = res.headers.get('x-middleware-rewrite');
      assert.ok(rewriteUrl?.includes('/owner'));
      assert.strictEqual(res.headers.get('x-portal-role'), 'owner');
    });
  });

  describe('2. Operator, Staff, POS & ID-Based Subdomains', () => {
    it('rewrites generic operator subdomain to /operator', () => {
      const req = createReq('http://operator.melt.com/', 'operator.melt.com');
      const res = middleware(req);
      assert.ok(res);
      const rewriteUrl = res.headers.get('x-middleware-rewrite');
      assert.ok(rewriteUrl?.includes('/operator'));
      assert.strictEqual(res.headers.get('x-portal-role'), 'operator');
    });

    it('extracts branch and staff ID from ID-based op-<branch> subdomain', () => {
      const req = createReq('http://op-alpha.melt.com/', 'op-alpha.melt.com');
      const res = middleware(req);
      assert.ok(res);
      const rewriteUrl = res.headers.get('x-middleware-rewrite');
      assert.ok(rewriteUrl?.includes('/operator'));
      assert.ok(rewriteUrl?.includes('branch=alpha'));
      assert.ok(rewriteUrl?.includes('staff=op-alpha'));
      assert.strictEqual(res.headers.get('x-branch-code'), 'alpha');
      assert.strictEqual(res.headers.get('x-staff-id'), 'op-alpha');
      assert.strictEqual(res.headers.get('x-portal-role'), 'operator');
    });

    it('extracts staff ID from staff-<id> subdomain', () => {
      const req = createReq('http://staff-101.melt.com/', 'staff-101.melt.com');
      const res = middleware(req);
      assert.ok(res);
      const rewriteUrl = res.headers.get('x-middleware-rewrite');
      assert.ok(rewriteUrl?.includes('/operator'));
      assert.ok(rewriteUrl?.includes('staff=staff-101'));
      assert.strictEqual(res.headers.get('x-staff-id'), 'staff-101');
    });

    it('SECURITY GATE: strictly blocks operator subdomain from accessing /owner portal', () => {
      const req = createReq('http://operator.melt.com/owner', 'operator.melt.com');
      const res = middleware(req);
      assert.ok(res);
      // Must be a redirect to /operator
      const location = res.headers.get('location');
      assert.ok(location?.includes('/operator'));
      assert.ok(!location?.includes('/owner'));
    });

    it('SECURITY GATE: strictly blocks ID-based op-<branch> subdomain from accessing /owner portal', () => {
      const req = createReq('http://op-beta.melt.com/owner/settings', 'op-beta.melt.com');
      const res = middleware(req);
      assert.ok(res);
      const location = res.headers.get('location');
      assert.ok(location?.includes('/operator'));
      assert.ok(location?.includes('branch=beta'));
    });
  });

  describe('3. Customer Online Ordering & ID-Based Customer Subdomains', () => {
    it('rewrites order and menu subdomains to /order', () => {
      const req = createReq('http://order.melt.com/', 'order.melt.com');
      const res = middleware(req);
      assert.ok(res);
      const rewriteUrl = res.headers.get('x-middleware-rewrite');
      assert.ok(rewriteUrl?.includes('/order'));
      assert.strictEqual(res.headers.get('x-portal-role'), 'customer');
    });

    it('extracts customer ID from cust-<id> subdomain', () => {
      const req = createReq('http://cust-alice.melt.com/', 'cust-alice.melt.com');
      const res = middleware(req);
      assert.ok(res);
      const rewriteUrl = res.headers.get('x-middleware-rewrite');
      assert.ok(rewriteUrl?.includes('/order'));
      assert.ok(rewriteUrl?.includes('customer=alice'));
      assert.strictEqual(res.headers.get('x-customer-id'), 'alice');
    });

    it('SECURITY GATE: strictly blocks customer subdomain from accessing /owner portal', () => {
      const req = createReq('http://order.melt.com/owner', 'order.melt.com');
      const res = middleware(req);
      assert.ok(res);
      const location = res.headers.get('location');
      assert.ok(location?.includes('/order'));
    });

    it('SECURITY GATE: strictly blocks customer subdomain from accessing /operator desk', () => {
      const req = createReq('http://cust-bob.melt.com/operator', 'cust-bob.melt.com');
      const res = middleware(req);
      assert.ok(res);
      const location = res.headers.get('location');
      assert.ok(location?.includes('/order'));
      assert.ok(location?.includes('customer=bob'));
    });
  });

  describe('4. Storefront Branch Subdomains & Sanitization', () => {
    it('routes branch code subdomain (bandra) to /order?branch=bandra', () => {
      const req = createReq('http://bandra.melt.com/', 'bandra.melt.com');
      const res = middleware(req);
      assert.ok(res);
      const rewriteUrl = res.headers.get('x-middleware-rewrite');
      assert.ok(rewriteUrl?.includes('/order'));
      assert.ok(rewriteUrl?.includes('branch=bandra'));
      assert.strictEqual(res.headers.get('x-branch-code'), 'bandra');
    });

    it('SECURITY GATE: blocks public branch storefront from accessing /owner', () => {
      const req = createReq('http://bandra.melt.com/owner', 'bandra.melt.com');
      const res = middleware(req);
      assert.ok(res);
      const location = res.headers.get('location');
      assert.ok(location?.includes('/order'));
      assert.ok(location?.includes('branch=bandra'));
    });

    it('sanitizes malicious characters in subdomain to prevent header injection', () => {
      const req = createReq('http://bad!sub#domain.melt.com/', 'bad!sub#domain.melt.com');
      const res = middleware(req);
      assert.ok(res);
      const sanitized = res.headers.get('x-subdomain');
      assert.strictEqual(sanitized, 'badsubdomain');
      assert.ok(!sanitized?.includes('!'));
      assert.ok(!sanitized?.includes('#'));
    });
  });
});
