"use client";

import React from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { MobileSidebar } from '@/components/MobileSidebar';
import { RequireAuth } from '@/components/AuthGuard';
import { useAuth } from '@/context/AuthProvider';

/**
 * Sub-admins may open /admin/users, /admin/messages and /admin/orders —
 * every other admin page shows a not-authorized note. The backend
 * enforces the same boundary with 403s; this just keeps the UI honest.
 * Direct-URL access is covered because this gate wraps the whole
 * /admin subtree.
 *
 * Orders is open to sub-admins per the Batch 02 decision (sub-admin
 * gets FULL access — everything the main admin can do): the backend
 * already allows them on GET /orders and POST
 * /orders/:id/confirm-payment, so the UI gate must not block them here.
 */
function AdminGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();

  // Sub-admins may use Users & KYC, Messages and Orders; everything else under /admin stays blocked.
  const subadminAllowed =
    pathname === '/admin/users' || pathname === '/admin/messages' || pathname === '/admin/orders';
  if (user?.role === 'subadmin' && !subadminAllowed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-6">
        <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          Not authorized
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
          Your support account can manage users, KYC, messages and orders only.
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
