"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { User } from '@/lib/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * Cookie-only auth shell. Session state lives exclusively in the
 * httpOnly `asan_token` cookie managed by the backend. This provider:
 *
 * - On mount: clears any stale localStorage auth keys, then calls
 *   GET /api/auth/me with credentials to restore the session from the cookie.
 * - login(): POST /api/auth/login with credentials, then sets user from the
 *   response or from GET /api/auth/me.
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

  const login = useCallback(async (identifier: string, password: string) => {
    const res = await api.login(identifier.trim(), password);
    if (res.user) {
      setUser(res.user);
    } else {
      const me = await api.me();
      if (me.user) setUser(me.user);
    }
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
    <AuthContext.Provider value={{ user, loading, login, logout }}>
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