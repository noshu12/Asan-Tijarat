// middleware.ts — host-based admin isolation (#4 admin subdomain, 8/8).
//
// Two hosts, two worlds:
//  - ADMIN_HOST (e.g. admin.asantijarat.com, or admin.localhost:3000 in dev):
//    only /admin/* (+ the sub-admin first-time 2FA setup page) is served.
//    Anything else redirects to /admin/login.
//  - Main host: /admin/* returns 404 (the admin panel does not exist here).
//    When ADMIN_HOST is unset (plain local dev), /admin/* keeps working on
//    the main host so existing workflows don't break.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Paths the admin subdomain may serve besides /admin/*.
const ADMIN_EXTRA_PATHS = ['/subadmin/setup'];

export function middleware(request: NextRequest) {
  const host = (request.headers.get('host') || '').toLowerCase();
  const adminHost = (process.env.ADMIN_HOST || '').toLowerCase();
  const { pathname } = request.nextUrl;

  // Never interfere with the API proxy, Next internals or static assets.
  if (
    pathname.startsWith('/backend-api') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    /\.[a-z0-9]+$/i.test(pathname)
  ) {
    return NextResponse.next();
  }

  const isAdminHost = Boolean(adminHost) && host === adminHost;

  if (isAdminHost) {
    const allowed =
      pathname.startsWith('/admin') || ADMIN_EXTRA_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
    if (!allowed) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    return NextResponse.next();
  }

  // Main host: hide the admin panel entirely when the subdomain is configured.
  if (pathname.startsWith('/admin') && adminHost) {
    return new NextResponse('Not Found', { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
