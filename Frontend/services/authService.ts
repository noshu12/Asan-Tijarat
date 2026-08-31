/**
 * 👤 AUTH SERVICE — authentication, session & profile data-access layer.
 *
 * ⚡ BACKEND INTEGRATION CONTRACT
 * Components never touch mock data or localStorage directly — they go through
 * this service (or the AuthProvider that delegates to it). Replace ONLY the
 * internals of these functions with real API calls; keep signatures stable:
 *
 *   loadPersistedUser()   →  GET    /api/auth/me
 *   signInAsRole(role)    →  POST   /api/auth/login      { role }
 *   signOut()             →  POST   /api/auth/logout
 *   mergeProfileUpdate()  →  PATCH  /api/users/me        { ...patch }
 */
import { User, UserRole } from '@/lib/types';
import { INITIAL_USERS } from '@/lib/mockData';

export const SESSION_ROLE_STORAGE_KEY = 'asan-user-role';
export const SESSION_PROFILE_STORAGE_KEY = 'asan-user-profile';

/** Runtime guard: whether an unknown value is a valid UserRole. */
export function isUserRole(value: unknown): value is UserRole {
  return value === 'shopkeeper' || value === 'supplier';
}

/** Where each role lands immediately after signing in. */
export function getHomeRouteForRole(role: UserRole): string {
  switch (role) {
    case 'supplier':
      return '/supplier/dashboard';
    case 'shopkeeper':
    default:
      return '/shopkeeper/dashboard';
  }
}

/**
 * Demo credentials backing the sign-in screen (mock DB row lookup).
 * MOCK OF: POST /api/auth/login → resolved session user.
 */
export function getSeedUser(role: UserRole): User | null {
  return INITIAL_USERS[role] ?? null;
}

/**
 * Public supplier record used on /supplier/profile.
 * MOCK OF: GET /api/users/supplier/:id → verified business profile.
 */
export function getSupplierBusinessProfile(): User | null {
  return INITIAL_USERS.supplier ?? null;
}

/**
 * Rehydrates the signed-in user from persisted session storage, falling back
 * to the seed account for the remembered role.
 * MOCK OF: GET /api/auth/me.
 */
export function loadPersistedUser(): User | null {
  if (typeof window === 'undefined') return null;

  const savedRole = window.localStorage.getItem(SESSION_ROLE_STORAGE_KEY);
  if (!savedRole || !isUserRole(savedRole)) return null;

  const seedUser = getSeedUser(savedRole);
  const savedProfile = window.localStorage.getItem(SESSION_PROFILE_STORAGE_KEY);
  if (!savedProfile) return seedUser;

  try {
    const parsed: unknown = JSON.parse(savedProfile);
    const candidate = parsed as User | null;
    if (candidate && candidate.role === savedRole && typeof candidate.id === 'string' && typeof candidate.name === 'string') {
      return candidate;
    }
    return seedUser;
  } catch {
    return seedUser;
  }
}

/** Persists the active session (role pointer + full profile snapshot). */
export function persistUser(user: User): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SESSION_ROLE_STORAGE_KEY, user.role);
    window.localStorage.setItem(SESSION_PROFILE_STORAGE_KEY, JSON.stringify(user));
  } catch {
    // Storage unavailable — session simply won't survive a refresh; never throw.
  }
}

/** Clears the active session. */
export function clearPersistedUser(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(SESSION_ROLE_STORAGE_KEY);
  window.localStorage.removeItem(SESSION_PROFILE_STORAGE_KEY);
}

/** Immutable profile update helper (used by settings forms). */
export function mergeProfileUpdate(currentUser: User, patch: Partial<User>): User {
  return { ...currentUser, ...patch };
}
