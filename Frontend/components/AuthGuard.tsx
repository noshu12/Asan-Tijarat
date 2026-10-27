"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthProvider';
import { UserRole } from '@/lib/types';
import { Loader } from '@/components/ui/loader';

/**
 * Portal guards.
 *
 * The three portal layouts (`/admin`, `/shopkeeper`, `/supplier`) previously
 * rendered no matter who was visiting, so a guest could open
 * `/admin/dashboard` and see an endless loading spinner instead of a sign-in
 * prompt. `RequireAuth` closes that hole: it resolves the session from the
 * AuthProvider (which fetches /api/auth/me via the httpOnly cookie), redirects
 * guests to `/signin?role=…&redirect=…` and bounces signed-in users who opened
 * another portal's URL back to their own dashboard.
 */

export const ROLE_HOME: Record<UserRole, string> = {
  shopkeeper: '/shopkeeper/dashboard',
  supplier: '/supplier/dashboard',
  admin: '/admin/dashboard',
};

interface RequireAuthProps {
  /** The one role allowed to see the wrapped subtree. */
  role: UserRole;
  children: React.ReactNode;
}

export function RequireAuth({ role, children }: RequireAuthProps) {
  const router = useRouter();
  const { user, loading } = useAuth();

  // While the provider is restoring the session from the httpOnly cookie,
  // show a loader — never flash the wrong UI.
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader />
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          Checking your session…
        </p>
      </div>
    );
  }

  // No session → send to sign-in with the attempted URL preserved.
  if (!user) {
    const here = `${window.location.pathname}${window.location.search}`;
    router.replace(`/signin?role=${role}&redirect=${encodeURIComponent(here)}`);
    return null;
  }

  // Wrong role → bounce to the user's own dashboard.
  if (user.role !== role) {
    router.replace(ROLE_HOME[user.role] || '/');
    return null;
  }

  return <>{children}</>;
}
