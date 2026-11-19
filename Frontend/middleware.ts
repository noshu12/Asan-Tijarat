// middleware.ts — host-based admin isolation (#4 admin subdomain, 8/8).
//
// Two hosts, two worlds:
//  - ADMIN_HOST (e.g. admin.asantijarat.com, or admin.localhost:3000 in dev):
//    only /admin/* (+ the admin/sub-admin first-time 2FA setup page) is served.
//    Anything else redirects to /admin/login.
//  - Main host: /admin/* returns 404 (the admin panel does not exist here).
//    When ADMIN_HOST is unset (plain local dev), /admin/* keeps working on
//    the main host so existing workflows don't break.
//
// FIX (New audit #5, decision 2026-11-19) — ADMIN_HOST is UNSET by deliberate
// choice: no domain is bought yet, so there is no admin subdomain and the
// isolation above stays off. /admin/* keeps working on the main host. The
// admin panel is protected instead by MANDATORY main-admin 2FA (see adminLogin
// in Backend/src/controllers/auth.controller.js). When a domain is bought
// later, set ADMIN_HOST and this isolation activates automatically — no code
// change needed then.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Paths the admin subdomain may serve besides /admin/*.
const ADMIN_EXTRA_PATHS = ['/subadmin-setup'];

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
