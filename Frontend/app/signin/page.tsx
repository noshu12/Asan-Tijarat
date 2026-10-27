"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UserRole } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/context/AuthProvider';
import {
  ShieldCheck,
  Store,
  Building2,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react';

const ROLE_HOME: Record<UserRole, string> = {
  shopkeeper: '/shopkeeper/dashboard',
  supplier: '/supplier/dashboard',
  admin: '/admin/dashboard',
};

export default function SignInPage() {
  const router = useRouter();
  const { user, loading: authLoading, login: authLogin } = useAuth();

  const [selectedRole, setSelectedRole] = useState<UserRole>('shopkeeper');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [redirectTarget, setRedirectTarget] = useState('');

  // Already signed in: send the user straight to their dashboard by
  // server role, instead of showing the sign-in form again.
  useEffect(() => {
    if (authLoading) return;
    if (user) {
      router.push(ROLE_HOME[user.role] || '/');
    }
  }, [authLoading, user, router]);

  // Deep-link hydration: /signin?role=shopkeeper only preselects the role
  // tab (read from window so the statically rendered page needs no Suspense).
  // It does NOT prefill any email or password.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedRole = params.get('role');
    if (
      requestedRole === 'shopkeeper' ||
      requestedRole === 'supplier' ||
      requestedRole === 'admin'
    ) {
      setSelectedRole(requestedRole);
    }
    const redirect = params.get('redirect');
    if (redirect) setRedirectTarget(redirect);
  }, []);

  // Warm up likely destinations in the background so post-login navigation
  // feels instant (Next.js compiles routes lazily in dev mode).
  useEffect(() => {
    router.prefetch('/supplier/dashboard');
    router.prefetch('/shopkeeper/dashboard');
  }, [router]);

  const handleRoleChange = (role: UserRole) => {
    setSelectedRole(role);
    setErrorMessage('');
    setErrorCode('');
  };

  // Calls POST /api/auth/login via the AuthProvider (sets the asan_token
  // httpOnly cookie), then redirects by role. No token is stored in
  // localStorage and no Authorization header is sent.
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setErrorCode('');
    setIsLoading(true);

    try {
      await authLogin(identifier.trim(), password);

      router.push(redirectTarget || ROLE_HOME[selectedRole] || '/');
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
        setErrorCode(err.code);
      } else {
        setErrorMessage('Unexpected error while signing in. Please try again.');
      }
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col md:flex-row bg-slate-50 dark:bg-slate-950">
      
      {/* Left Brand Panel (Dark Green #0B3D2E) */}
      <div className="w-full md:w-1/2 bg-asan-dark text-white p-8 sm:p-14 lg:p-20 flex flex-col justify-between relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div>
          <Link href="/" className="inline-flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="Asan Tijarat logo"
              className="w-10 h-10 rounded-xl object-contain"
            />
            <span className="font-bold text-2xl tracking-tight">Asan Tijarat</span>
          </Link>

          <div className="mt-16 sm:mt-24">
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
              Pakistan&apos;s leading <br />
              <span className="text-emerald-400">B2B trade platform</span>
            </h2>

            <div className="mt-10 space-y-4 text-sm sm:text-base text-emerald-100/90">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-asan-accent shrink-0" />
                <span>Accounts verified before trading</span>
              </div>
              <div className="flex items-center gap-3">
                <Store className="w-5 h-5 text-asan-accent shrink-0" />
                <span>Separate shopkeeper and supplier portals</span>
              </div>
              <div className="flex items-center gap-3">
                <Building2 className="w-5 h-5 text-asan-accent shrink-0" />
                <span>Bulk orders with minimum order quantity</span>
              </div>
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-asan-accent shrink-0" />
                <span>Price per pack, clearly shown</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 text-xs text-emerald-200/50">
          © 2026 Asan Tijarat. Final Year Project — FUUAST. All rights reserved.
        </div>
      </div>

      {/* Right Form Panel (Matching Figma sl4.png) */}
      <div className="w-full md:w-1/2 p-6 sm:p-12 lg:p-16 flex items-center justify-center">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200/80 dark:border-slate-800 shadow-xl">
          
          <div className="mb-6">
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Sign In</h3>
            <p className="text-xs text-slate-500 mt-1">Select your account role to continue</p>
          </div>

          {/* Role Selection Tabs */}
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 mb-6">
            <button
              type="button"
              onClick={() => handleRoleChange('shopkeeper')}
              className={`py-2 rounded-lg text-xs font-bold transition ${
                selectedRole === 'shopkeeper'
                  ? 'bg-white dark:bg-slate-900 text-asan-dark dark:text-emerald-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Shopkeeper
            </button>
            <button
              type="button"
              onClick={() => handleRoleChange('supplier')}
              className={`py-2 rounded-lg text-xs font-bold transition ${
                selectedRole === 'supplier'
                  ? 'bg-white dark:bg-slate-900 text-asan-dark dark:text-emerald-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Supplier
            </button>
            <button
              type="button"
              onClick={() => handleRoleChange('admin')}
              className={`py-2 rounded-lg text-xs font-bold transition ${
                selectedRole === 'admin'
                  ? 'bg-white dark:bg-slate-900 text-asan-dark dark:text-emerald-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Admin
            </button>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              label="Phone or Email"
              type="text"
              placeholder="+92 300 1234567"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />

            <div className="space-y-1.5 relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-8 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                Forgot password?
              </button>
            </div>

            {errorMessage && (
              <p
                role="alert"
                className={
                  errorCode === 'ACCOUNT_PENDING_VERIFICATION'
                    ? 'text-xs font-semibold leading-relaxed text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-2.5'
                    : 'text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5'
                }
              >
                {errorMessage}
              </p>
            )}

            <Button type="submit" isLoading={isLoading} className="w-full h-12 text-sm font-bold mt-2">
              Sign In as {selectedRole === 'admin' ? 'Admin' : selectedRole === 'supplier' ? 'Supplier' : 'Shopkeeper'}
            </Button>
          </form>

          <p className="text-center text-xs text-slate-500 mt-6">
            New to Asan Tijarat?{' '}
            <Link href="/getstarted" className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline">
              Create account
            </Link>
          </p>
        </div>
      </div>

    </div>
  );
}
