"use client";

import React, { useState } from 'react';
import { LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthProvider';
import { clearCart } from '@/lib/cart';

interface SignOutButtonProps {
  /** Surface-specific classes — the button ships with a neutral base style. */
  className?: string;
  /** Render the "Sign Out" label next to the icon (false = compact icon-only). */
  showLabel?: boolean;
  /** Where to land once the session is cleared. Defaults to the public home page. */
  redirectTo?: string;
  /** Optional callback fired after local state is cleared (e.g. close a drawer). */
  onSignOut?: () => void;
}

/**
 * Secure sign-out control shared by the portal chrome (dashboard sidebar) and
 * the public Navbar, so every role logs out the same way:
 *
 * 1. `logout()` clears the asan_token session cookie via the AuthProvider.
 * 2. `clearCart()` removes per-browser basket data so nothing leaks to the next
 *    person who signs in on a shared device (AUDIT_REPORT.md W-4).
 * 3. `window.location.replace()` performs a full navigation. Unlike a client
 *    route push this drops every in-memory store (Navbar session, cart/order
 *    caches) and replaces the protected URL in history, so the Back button
 *    cannot return to an authenticated page.
 */
export function SignOutButton({
  className,
  showLabel = true,
  redirectTo = '/',
  onSignOut,
}: SignOutButtonProps) {
  const [signingOut, setSigningOut] = useState(false);
  const { logout } = useAuth();

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);

    // Drop credentials + per-browser state before navigating away.
    await logout();
    clearCart();

    onSignOut?.();

    // Full navigation — guarantees a clean, unauthenticated app state.
    window.location.replace(redirectTo);
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={signingOut}
      title="Sign out"
      aria-label="Sign out of your account"
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl text-xs font-bold transition disabled:opacity-60 disabled:cursor-not-allowed',
        className
      )}
    >
      <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
      {showLabel && <span>Sign Out</span>}
    </button>
  );
}
