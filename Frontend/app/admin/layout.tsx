"use client";

import React from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { MobileSidebar } from '@/components/MobileSidebar';
import { RequireAuth } from '@/components/AuthGuard';
import { useAuth } from '@/context/AuthProvider';

/**
 * Sub-admins (KYC reviewers) may ONLY open /admin/users — every other admin
 * page shows a not-authorized note. The backend enforces the same boundary
 * with 403s; this just keeps the UI honest. Direct-URL access is covered
 * because this gate wraps the whole /admin subtree.
 */
function AdminGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();

  // Sub-admins may use Users & KYC and Messages; everything else under /admin stays blocked.
  const subadminAllowed = pathname === '/admin/users' || pathname === '/admin/messages';
  if (user?.role === 'subadmin' && !subadminAllowed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-6">
        <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          Not authorized
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
          Your support account can manage users, KYC and messages only.
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

export default function AdminLayout({
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
        <div className="flex-1 p-4 sm:p-8 max-w-7xl overflow-x-hidden">
          <AdminGate>{children}</AdminGate>
        </div>
      </div>
      {/* Slide-in drawer navigation for phones */}
      <MobileSidebar />
    </RequireAuth>
  );
}
