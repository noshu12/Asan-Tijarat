"use client";

import React, { useEffect } from 'react';
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
  // Sub-admins have no dashboard — their home is the Users & KYC review page.
  subadmin: '/admin/users',
};

interface RequireAuthProps {
  /** The role(s) allowed to see the wrapped subtree. */
  role: UserRole | UserRole[];
  children: React.ReactNode;
}

export function RequireAuth({ role, children }: RequireAuthProps) {
  const router = useRouter();
  const { user, loading } = useAuth();

  // Stable key: AdminClient passes role={['admin', 'subadmin']} as an
  // inline array, which is a new reference on every render — using it
  // directly in the effect deps would re-run the redirect every render.
  const roleKey = Array.isArray(role) ? [...role].sort().join(',') : role;
  const allowed = roleKey.split(',');

  // Navigation is a side effect — it must NOT run during render. Calling
  // router.replace() in the render body made React warn after logout:
  // "Cannot update a component ('Router') while rendering a different
  // component ('RequireAuth')" (seen 2026-11-21). The effect runs after
  // render; the render itself only decides what to show (loader / null /
  // children), so the warning is gone and behaviour is unchanged.
  useEffect(() => {
    if (loading) return;
    // Derived here (not from the render body) so the dep list stays exact:
    // roleKey is a string, so splitting it inside the effect is stable.
    const allowedInEffect = roleKey.split(',');
    // No session → send to sign-in with the attempted URL preserved.
    // On the admin host, admins go straight to /admin/login (the
    // middleware would bounce /signin there anyway — skip the double
    // redirect).
    if (!user) {
      const here = `${window.location.pathname}${window.location.search}`;
      const isAdminRoute = allowedInEffect.includes('admin') || allowedInEffect.includes('subadmin');
      const adminHost = process.env.NEXT_PUBLIC_ADMIN_HOST || '';
      if (isAdminRoute && adminHost && window.location.host === adminHost) {
        router.replace(`/admin/login?redirect=${encodeURIComponent(here)}`);
      } else {
        router.replace(`/signin?role=${roleKey}&redirect=${encodeURIComponent(here)}`);
      }
      return;
    }
    // Wrong role → bounce to the user's own dashboard.
    if (!allowedInEffect.includes(user.role)) {
      router.replace(ROLE_HOME[user.role] || '/');
    }
  }, [loading, user, roleKey, router]);

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

  // No session / wrong role → render nothing; the effect above redirects.
  if (!user) return null;
  if (!allowed.includes(user.role)) return null;

  return <>{children}</>;
}

