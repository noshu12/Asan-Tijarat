"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { User } from '@/lib/types';

/** What login() hands back — a signed-in session, a 2FA challenge, or a
 *  mandatory first-time 2FA setup (sub-admins). */
export interface LoginResult {
  requires2FA: boolean;
  requires2FASetup?: boolean;
  tempToken?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (identifier: string, password: string, turnstileToken?: string) => Promise<LoginResult>;
  /** Completes an admin 2FA sign-in (tempToken + 6-digit code → session). */
  verifyTwoFactorLogin: (tempToken: string, token: string, turnstileToken?: string) => Promise<void>;
  logout: () => Promise<void>;
  /**
   * Batch 17 (L3) — the short-lived 2FA-setup tempToken, kept in memory
   * (React state) only: never localStorage/sessionStorage, so an XSS
   * cannot read it after the fact. Set on a requires2FASetup login,
   * read by /subadmin-setup, cleared after setup completes. Dies on
   * refresh — the user just signs in again (the token lives 5 min anyway).
   */
  twoFactorSetupToken: string;
  setTwoFactorSetupToken: (token: string) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * Cookie-only auth shell. Session state lives exclusively in the
 * httpOnly `asan_token` cookie managed by the backend. This provider:
 *
 * - On mount: clears any stale localStorage auth keys, then calls
 *   GET /api/auth/me with credentials to restore the session from the cookie.
 * - login(): POST /api/auth/login with credentials. Normal accounts get the
 *   session + user straight away; admins with 2FA enabled get
 *   { requires2FA: true, tempToken } and must finish via verifyTwoFactorLogin().
 * - verifyTwoFactorLogin(): POST /api/auth/2fa/login with the tempToken and the
 *   6-digit authenticator code, then sets the user from the session.
 * - logout(): POST /api/auth/logout with credentials, then clears local state.
 *
 * Never reads or writes a token to localStorage. Never sends an
 * Authorization header.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // Batch 17 (L3) — 2FA-setup tempToken lives in memory only (see above).
  const [twoFactorSetupToken, setTwoFactorSetupToken] = useState('');

  // Drop any stale localStorage auth keys left over from the old flow.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem('asan_token');
        window.localStorage.removeItem('asan_user');
      } catch {}
    }
  }, []);

  // Restore session from the httpOnly cookie on first load.
  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        const res = await api.me();
        if (mounted && res.user) setUser(res.user);
      } catch (err) {
        // Guests have no session: GET /api/auth/me answers 401, and that
        // is the expected case — return silently, no error state, no log.
        // (Fix #14, teamily audit: the 401 used to look like an error.)
        if (err instanceof ApiError && err.status === 401) {
          if (mounted) setUser(null);
          return;
        }
        // Anything else (network down, 5xx) — same as before: no session.
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    init();
    return () => { mounted = false; };
  }, []);

  const login = useCallback(async (identifier: string, password: string, turnstileToken?: string): Promise<LoginResult> => {
    const res = await api.login(identifier.trim(), password, turnstileToken);
    if ('requires2FASetup' in res) {
      // Sub-admin first sign-in — 2FA setup is mandatory before any session.
      // The caller redirects to the setup page; the tempToken travels in
      // memory (twoFactorSetupToken), never in storage — Batch 17 (L3).
      setTwoFactorSetupToken(res.tempToken || '');
      return { requires2FA: false, requires2FASetup: true, tempToken: res.tempToken };
    }
    if ('requires2FA' in res) {
      // Admin with 2FA enabled — the password was correct but there is no
      // session yet (no cookie was issued). The caller shows the 6-digit
      // code step; verifyTwoFactorLogin() below finishes the sign-in.
      // NOTE: api.me() must NOT be called here — it would 401 without a cookie.
      return { requires2FA: true, tempToken: res.tempToken };
    }
    setUser(res.user);
    return { requires2FA: false };
  }, []);

  const verifyTwoFactorLogin = useCallback(async (tempToken: string, token: string, turnstileToken?: string) => {
    const res = await api.verifyTwoFactorLogin(tempToken, token.trim(), turnstileToken);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Ignore logout errors — always clear local state.
    }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, verifyTwoFactorLogin, twoFactorSetupToken, setTwoFactorSetupToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}