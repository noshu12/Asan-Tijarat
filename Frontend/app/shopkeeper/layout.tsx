"use client";

import React from 'react';
import { Sidebar } from '@/components/Sidebar';
import { MobileSidebar } from '@/components/MobileSidebar';
import { RequireAuth } from '@/components/AuthGuards';
import type { UserRole } from '@/lib/types';

/** Module-level constant keeps the guard's effect deps stable. */
const SHOPKEEPER_ONLY: UserRole[] = ['shopkeeper'];

export default function ShopkeeperLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth allowedRoles={SHOPKEEPER_ONLY}>
      <div className="flex min-h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-950">
        <div className="hidden md:block shrink-0">
          <Sidebar />
        </div>
        <div className="flex-1 p-4 sm:p-8 max-w-7xl overflow-x-hidden">
          {children}
        </div>
      </div>
      {/* Slide-in drawer navigation for phones */}
      <MobileSidebar />
    </RequireAuth>
  );
}