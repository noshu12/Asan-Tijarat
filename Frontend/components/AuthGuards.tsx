"use client";

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { getHomeRouteForRole } from '@/services/authService';
import type { UserRole } from '@/lib/types';

/**
 * Guards authenticated routes (e.g. /shopkeeper/*, /supplier/*).
 *
 * Two layers of protection:
 *  1. Unauthenticated visitors → redirected to /signin (remembering the
 *     attempted URL so login can bounce them back).
 *  2. When `allowedRoles` is provided, signed-in users with a DIFFERENT role
 *     are bounced to their own portal home — this stops a shopkeeper from
 *     ever rendering /supplier/* pages (and vice versa).
 * Renders nothing while the saved session is restored from localStorage,
 * and while an unauthorized-role redirect is in flight.
 */
export function RequireAuth({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  /** Optional role whitelist — omit to allow ANY signed-in user. */
  allowedRoles?: UserRole[];
}) {
  const { isAuthenticated, isHydrating, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isHydrating) return;
    if (!isAuthenticated) {
      router.replace(`/signin?redirect=${encodeURIComponent(pathname)}`);
      return;
    }
    if (user && allowedRoles && !allowedRoles.includes(user.role)) {
      router.replace(getHomeRouteForRole(user.role));
    }
  }, [isHydrating, isAuthenticated, user, allowedRoles, router, pathname]);

  const isWrongRole = Boolean(user && allowedRoles && !allowedRoles.includes(user.role));

  if (isHydrating || !isAuthenticated || isWrongRole) return null;

  return <>{children}</>;
}

/**
 * Guards public auth pages (e.g. /signin, /getstarted).
 * Redirects already-authenticated visitors to their role's dashboard so a
 * "logged in" profile chip never appears on the sign-in/registration pages.
 */
export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { role, isHydrating } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isHydrating) return;
    if (role === 'none') return;

    router.replace(getHomeRouteForRole(role));
  }, [isHydrating, role, router]);

  if (isHydrating) return null;

  return <>{children}</>;
}