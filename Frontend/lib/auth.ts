import type { User } from './types';

/**
 * Auth session helpers - SSR-safe localStorage helpers.
 *
 * NOTE: The live app does NOT decide login from these helpers anymore.
 * Login now uses the httpOnly asan_token cookie + AuthProvider, and
 * lib/api.ts already sends credentials: 'include' on every call.
 * These helpers are kept only as clean, standalone utilities - do not
 * use getToken() to guard pages or to send an Authorization header.
 */

const TOKEN_KEY = 'asan_token';
const USER_KEY = 'asan_user';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function getUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch { return null; }
}

export function saveToken(token: string): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(TOKEN_KEY, token); } catch { /* storage unavailable */ }
}

export function saveUser(user: User): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch { /* storage unavailable */ }
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
  } catch { /* ignore */ }
}
