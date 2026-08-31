"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, UserRole } from '@/lib/types';
import { useCart } from './CartContext';
import { useRouter } from 'next/navigation';
import {
  clearPersistedUser,
  getHomeRouteForRole,
  getSeedUser,
  loadPersistedUser,
  mergeProfileUpdate,
  persistUser,
} from '@/services/authService';

interface AuthContextType {
  user: User | null;
  role: UserRole | 'none';
  isAuthenticated: boolean;
  isHydrating: boolean;
  login: (role: UserRole, redirectTo?: string) => void;
  logout: () => void;
  updateUserProfile: (data: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const router = useRouter();
  const { clearCart } = useCart();

  // Rehydrate session once on mount (delegates storage/API to authService).
  useEffect(() => {
    setUser(loadPersistedUser());
    setIsHydrating(false);
  }, []);

  /**
   * Signs in as a demo role account, persists the session and navigates the
   * user straight to the requested destination (or their role dashboard).
   * MOCK OF: POST /api/auth/login → resolved session user.
   */
  const login = (selectedRole: UserRole, redirectTo?: string) => {
    const newUser = getSeedUser(selectedRole) ?? getSeedUser('shopkeeper');
    if (!newUser) return;

    setUser(newUser);
    persistUser(newUser);
    router.push(redirectTo || getHomeRouteForRole(selectedRole));
  };

  /**
   * Ends the session, wipes the local cart (shared-browser privacy) and
   * returns to the public landing page.
   */
  const logout = () => {
    setUser(null);
    clearPersistedUser();
    clearCart();
    router.push('/');
  };

  /** Applies profile edits (settings forms) to the active session. */
  const updateUserProfile = (data: Partial<User>) => {
    if (!user) return;
    const updated = mergeProfileUpdate(user, data);
    setUser(updated);
    persistUser(updated);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user ? user.role : 'none',
        isAuthenticated: !!user,
        isHydrating,
        login,
        logout,
        updateUserProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
