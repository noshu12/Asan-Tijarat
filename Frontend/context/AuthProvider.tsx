"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { User } from '@/lib/types';

/** What login() hands back — either a signed-in session or a 2FA challenge. */
export interface LoginResult {
  requires2FA: boolean;
  tempToken?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<LoginResult>;
  /** Completes an admin 2FA sign-in (tempToken + 6-digit code → session). */
  verifyTwoFactorLogin: (tempToken: string, token: string) => Promise<void>;
  logout: () => Promise<void>;
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
      } catch {
        // 401 or network error — no session.
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    init();
    return () => { mounted = false; };
  }, []);

  const login = useCallback(async (identifier: string, password: string): Promise<LoginResult> => {
    const res = await api.login(identifier.trim(), password);
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

  const verifyTwoFactorLogin = useCallback(async (tempToken: string, token: string) => {
    const res = await api.verifyTwoFactorLogin(tempToken, token.trim());
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
    <AuthContext.Provider value={{ user, loading, login, logout, verifyTwoFactorLogin }}>
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