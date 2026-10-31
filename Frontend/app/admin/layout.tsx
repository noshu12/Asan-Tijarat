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

  if (user?.role === 'subadmin' && pathname !== '/admin/users') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-6">
        <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          Not authorized
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
          Your reviewer account can only verify users and view KYC documents.
        </p>
        <a
          href="/admin/users"
          className="text-sm font-medium text-emerald-700 underline hover:text-emerald-900"
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
