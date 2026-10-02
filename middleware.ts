import { NextResponse, type NextRequest } from 'next/server';

/**
 * Multi-Tenant Subdomain & Role Routing Middleware
 *
 * Supported Subdomains:
 * - owner.yourdomain.com / admin.yourdomain.com -> Owner Enterprise Portal (/owner)
 * - operator.yourdomain.com / staff.yourdomain.com / pos.yourdomain.com -> Branch Operator POS Desk (/operator)
 * - order.yourdomain.com / menu.yourdomain.com / app.yourdomain.com -> Customer Online Ordering (/order)
 * - <branch-code>.yourdomain.com (e.g. bandra.melt.com, alpha.melt.com) -> Store-specific storefront (/order?branch=<codecode>)
 * - yourdomain.com / www.yourdomain.com -> Public brand showcase & landing page (/)
 *
 * Also works in local development:
 * - owner.localhost:3000
 * - operator.localhost:3000
 * - order.localhost:3000
 * - alpha.localhost:3000
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

  // 2. Extract subdomain
  const hostWithoutPort = hostname.split(':')[0].toLowerCase();
  const parts = hostWithoutPort.split('.');

  let subdomain = '';
  if (hostWithoutPort.endsWith('localhost') && parts.length > 1) {
    subdomain = parts[0];
  } else if (parts.length > 2) {
    subdomain = parts[0];
  }

  // Ignore 'www'
  if (subdomain === 'www') {
    subdomain = '';
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-subdomain', subdomain);

  // 3. Subdomain-based Routing
  if (subdomain === 'owner' || subdomain === 'admin') {
    if (pathname === '/') {
      url.pathname = '/owner';
      return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    }
  } else if (subdomain === 'operator' || subdomain === 'staff' || subdomain === 'pos') {
    if (pathname === '/') {
      url.pathname = '/operator';
      return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    }
  } else if (subdomain === 'order' || subdomain === 'app' || subdomain === 'menu') {
    if (pathname === '/') {
      url.pathname = '/order';
      return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    }
  } else if (subdomain) {
    // Specific branch code (e.g., "alpha", "beta", "bandra", "juhu")
    requestHeaders.set('x-branch-code', subdomain);

    if (pathname === '/') {
      url.pathname = '/order';
      url.searchParams.set('branch', subdomain);
      return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    } else if (pathname === '/operator' || pathname === '/pos') {
      url.pathname = '/operator';
      url.searchParams.set('branch', subdomain);
      return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    }
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
