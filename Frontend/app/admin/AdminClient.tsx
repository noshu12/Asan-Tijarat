"use client";

import React from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { MobileSidebar } from '@/components/MobileSidebar';
import { RequireAuth } from '@/components/AuthGuard';
import { useAuth } from '@/context/AuthProvider';

/**
 * Sub-admins may open /admin/users, /admin/messages, /admin/orders and
 * /admin/disputes — every other admin page shows a not-authorized note.
 * The backend enforces the same boundary with 403s; this just keeps the
 * UI honest. Direct-URL access is covered because this gate wraps the
 * whole /admin subtree.
 *
 * Orders is open to sub-admins per the Batch 02 decision (sub-admin
 * gets FULL access — everything the main admin can do): the backend
 * already allows them on GET /orders and POST
 * /orders/:id/confirm-payment, so the UI gate must not block them here.
 *
 * Disputes is open to sub-admins per Batch 15 (Noushad, 2026-11-22):
 * disputes AND refunds are admin-or-sub-admin work. The refund itself
 * is a dispute decision (refund_full / refund_partial / return_goods),
 * and the backend already allows sub-admins on GET /api/admin/disputes
 * and POST /api/admin/disputes/:id/decide — so the UI gate must not
 * block them here either.
 *
 * Dashboard, Products, Security, Contacts and Sub-Admins
 * stay main-admin-only — and since Batch 17 (Round-5 audit H1) the
 * backend DOES 403 sub-admins on those routes (GET /api/admin/stats,
 * /products, /contacts, DELETE /users/:id), matching this
 * gate. (The old comment here claimed the backend already 403d them —
 * that was WRONG until Batch 17: the backend used to allow sub-admins
 * on all of them. The gate and the backend now agree.)
 *
 * NOTE (Batch 22) — there is no audit-log page and no /api/admin/audit-log
 * endpoint any more (Round-5 audit h-M3: orphaned endpoint, removed
 * instead of building a page for it). The audit trail is still WRITTEN
 * (Backend/src/controllers/admin.controller.js writeAuditLog); it is
 * just not listed through any UI or API.
 */
function AdminGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();

  // Sub-admins may use Users & KYC, Messages, Orders and Disputes;
  // everything else under /admin stays blocked. The disputes prefix
  // covers a future /admin/disputes/[id] detail route too.
  const subadminAllowed =
    pathname === '/admin/users' ||
    pathname === '/admin/messages' ||
    pathname === '/admin/orders' ||
    pathname === '/admin/disputes' ||
    pathname.startsWith('/admin/disputes/');
  if (user?.role === 'subadmin' && !subadminAllowed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-6">
        <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          Not authorized
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
          Your support account can manage users, KYC, messages, orders and disputes only.
        </p>
        <a
          href="/admin/users"
          className="text-sm font-medium text-asan-accent-hover underline hover:text-asan-dark"
        >
          Go to Users &amp; KYC
        </a>
      </div>
    );
  }
  return <>{children}</>;
}

export function AdminClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // The login page must NOT sit inside RequireAuth — otherwise an
  // unauthenticated visit to /admin/login redirects to itself in a loop.
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }
  return (
    <RequireAuth role={['admin', 'subadmin']}>
      <div className="flex min-h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-950">
        <div className="hidden md:block shrink-0">
          <Sidebar />
        </div>
        <div className="flex-1 px-4 pt-4 pb-20 sm:px-8 sm:pt-8 md:pb-8 max-w-7xl overflow-x-hidden">
          <AdminGate>{children}</AdminGate>
        </div>
      </div>
      {/* Slide-in drawer navigation for phones */}
      <MobileSidebar />
    </RequireAuth>
  );
}
