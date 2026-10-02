import { NextResponse, type NextRequest } from 'next/server';

/**
 * Multi-Tenant Subdomain, ID-based Routing & Role Safety Boundary Middleware
 *
 * Supported Subdomain Architecture:
 * 1. Enterprise Owner / Admin Portal:
 *    - owner.yourdomain.com / admin.yourdomain.com -> /owner
 *
 * 2. Branch Operator, Staff POS & Person/ID-based Subdomains:
 *    - operator.yourdomain.com / staff.yourdomain.com / pos.yourdomain.com -> /operator
 *    - op-<id>.yourdomain.com (e.g. op-alpha.melt.com) -> /operator?branch=<id>&staff=op-<id>
 *    - staff-<id>.yourdomain.com (e.g. staff-101.melt.com) -> /operator?branch=101&staff=staff-101
 *    - pos-<counterId>.yourdomain.com / desk-<id>.yourdomain.com -> /operator?pos=<counterId>
 *    - Strict Security Gate: Operator subdomains attempting to access /owner or /owner/* are redirected to /operator.
 *
 * 3. Customer Online Ordering & ID-based Customer Subdomains:
 *    - order.yourdomain.com / menu.yourdomain.com / app.yourdomain.com -> /order
 *    - cust-<id>.yourdomain.com (e.g. cust-alice.melt.com, cust-123.melt.com) -> /order?customer=<id>
 *    - user-<id>.yourdomain.com -> /order?user=<id>
 *    - Strict Security Gate: Customer subdomains attempting to access /owner or /operator are redirected to /order.
 *
 * 4. Store-specific Brand Subdomains:
 *    - <branch-code>.yourdomain.com (e.g. alpha.melt.com, bandra.melt.com) -> /order?branch=<branch-code>
 *    - Accessing /operator on branch subdomain -> /operator?branch=<branch-code>
 *    - Accessing /owner on public branch subdomain -> safely redirected to /order?branch=<branch-code>
 */
export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const hostname = request.headers.get('host') || '';
  const pathname = url.pathname;

  // 1. Skip static assets, internal Next.js paths, and direct API endpoints
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/static') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // 2. Extract and sanitize subdomain
  const hostWithoutPort = hostname.split(':')[0].toLowerCase();
  const parts = hostWithoutPort.split('.');

  let rawSubdomain = '';
  if (hostWithoutPort.endsWith('localhost') && parts.length > 1) {
    rawSubdomain = parts[0];
  } else if (parts.length > 2) {
    rawSubdomain = parts[0];
  }

  // Ignore 'www'
  if (rawSubdomain === 'www') {
    rawSubdomain = '';
  }

  // Sanitize against header injection or illegal characters
  const subdomain = rawSubdomain.replace(/[^a-z0-9_-]/g, '');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-subdomain', subdomain);

  // Helper to ensure headers are available to both server rewrite and client tests
  const applyHeaders = (res: NextResponse): NextResponse => {
    requestHeaders.forEach((val, key) => {
      res.headers.set(key, val);
    });
    return res;
  };

  // 3. Subdomain-based Routing & Role Safety Boundary Enforcement

  // Case A: Owner / Admin Subdomain
  if (subdomain === 'owner' || subdomain === 'admin') {
    requestHeaders.set('x-portal-role', 'owner');
    if (pathname === '/') {
      url.pathname = '/owner';
      return applyHeaders(NextResponse.rewrite(url, { request: { headers: requestHeaders } }));
    }
    return applyHeaders(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  // Case B: Operator / Staff / POS & Person/ID-based Operator Subdomains
  const isOperatorSubdomain =
    subdomain === 'operator' ||
    subdomain === 'staff' ||
    subdomain === 'pos' ||
    subdomain.startsWith('op-') ||
    subdomain.startsWith('staff-') ||
    subdomain.startsWith('pos-') ||
    subdomain.startsWith('desk-');

  if (isOperatorSubdomain) {
    requestHeaders.set('x-portal-role', 'operator');

    // Extract ID if person/ID-based
    let extractedBranch = '';
    let extractedStaffId = '';

    if (subdomain.startsWith('op-')) {
      extractedBranch = subdomain.slice(3);
      extractedStaffId = subdomain;
    } else if (subdomain.startsWith('staff-')) {
      extractedBranch = subdomain.slice(6);
      extractedStaffId = subdomain;
    } else if (subdomain.startsWith('pos-') || subdomain.startsWith('desk-')) {
      extractedStaffId = subdomain;
    }

    if (extractedBranch) {
      requestHeaders.set('x-branch-code', extractedBranch);
    }
    if (extractedStaffId) {
      requestHeaders.set('x-staff-id', extractedStaffId);
    }

    // Strict Security Boundary: Block operator/staff subdomain from accessing Owner Portal
    if (pathname.startsWith('/owner')) {
      url.pathname = '/operator';
      if (extractedBranch) url.searchParams.set('branch', extractedBranch);
      return applyHeaders(NextResponse.redirect(url));
    }

    // Default entrypoint rewrite
    if (pathname === '/') {
      url.pathname = '/operator';
      if (extractedBranch) url.searchParams.set('branch', extractedBranch);
      if (extractedStaffId) url.searchParams.set('staff', extractedStaffId);
      return applyHeaders(NextResponse.rewrite(url, { request: { headers: requestHeaders } }));
    }

    return applyHeaders(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  // Case C: Customer Online Ordering & ID-based Customer Subdomains
  const isCustomerSubdomain =
    subdomain === 'order' ||
    subdomain === 'app' ||
    subdomain === 'menu' ||
    subdomain.startsWith('cust-') ||
    subdomain.startsWith('user-');

  if (isCustomerSubdomain) {
    requestHeaders.set('x-portal-role', 'customer');

    let customerId = '';
    if (subdomain.startsWith('cust-')) {
      customerId = subdomain.slice(5);
    } else if (subdomain.startsWith('user-')) {
      customerId = subdomain.slice(5);
    }

    if (customerId) {
      requestHeaders.set('x-customer-id', customerId);
    }

    // Strict Security Boundary: Block customer subdomain from accessing Owner or Operator areas
    if (pathname.startsWith('/owner') || pathname.startsWith('/operator')) {
      url.pathname = '/order';
      if (customerId) url.searchParams.set('customer', customerId);
      return applyHeaders(NextResponse.redirect(url));
    }

    // Default entrypoint rewrite
    if (pathname === '/') {
      url.pathname = '/order';
      if (customerId) url.searchParams.set('customer', customerId);
      return applyHeaders(NextResponse.rewrite(url, { request: { headers: requestHeaders } }));
    }

    return applyHeaders(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  // Case D: Branch-Specific Storefront Subdomain (e.g. alpha, beta, bandra)
  if (subdomain) {
    requestHeaders.set('x-branch-code', subdomain);

    // Strict Security Boundary: Public branch storefront cannot browse /owner
    if (pathname.startsWith('/owner')) {
      url.pathname = '/order';
      url.searchParams.set('branch', subdomain);
      return applyHeaders(NextResponse.redirect(url));
    }

    if (pathname === '/') {
      url.pathname = '/order';
      url.searchParams.set('branch', subdomain);
      return applyHeaders(NextResponse.rewrite(url, { request: { headers: requestHeaders } }));
    } else if (pathname === '/operator' || pathname === '/pos') {
      url.pathname = '/operator';
      url.searchParams.set('branch', subdomain);
      return applyHeaders(NextResponse.rewrite(url, { request: { headers: requestHeaders } }));
    }
  }

  return applyHeaders(
    NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    }),
  );
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
