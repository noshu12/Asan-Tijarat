"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { RedirectIfAuthed } from '@/components/AuthGuards';
import { UserRole } from '@/lib/types';
import { useToast } from '@/context/ToastContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Store,
  ShieldCheck,
  Sparkles,
  CreditCard,
  Truck,
  Eye,
  EyeOff,
  User,
  Building2,
  Lock
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function SignInPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { showToast } = useToast();

  const [selectedRole, setSelectedRole] = useState<UserRole>('shopkeeper');
  const [identifier, setIdentifier] = useState('03214567890');
  const [password, setPassword] = useState('password123');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  /** Destination bounced from an auth guard (e.g. ?redirect=/shopkeeper/cart). */
  const [redirectTo, setRedirectTo] = useState<string | null>(null);

  // Deep-link hydration: /signin?role=shopkeeper&redirect=/marketplace
  // (read from window so the statically rendered page needs no Suspense boundary)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedRole = params.get('role');
    if (
      requestedRole === 'shopkeeper' ||
      requestedRole === 'supplier'
    ) {
      setSelectedRole(requestedRole);
      setIdentifier(
        requestedRole === 'shopkeeper'
          ? 'hassan.traders@gmail.com'
          : 'ahmed@akenterprises.pk'
      );
    }
    const redirectParam = params.get('redirect');
    if (redirectParam && redirectParam.startsWith('/')) {
      setRedirectTo(redirectParam);
    }
  }, []);

  // Warm up likely destinations in the background so post-login navigation
  // feels instant (Next.js compiles routes lazily in dev mode).
  useEffect(() => {
    router.prefetch('/supplier/dashboard');
    router.prefetch('/shopkeeper/dashboard');
  }, [router]);

  const handleRoleChange = (role: UserRole) => {
    setSelectedRole(role);
    if (role === 'shopkeeper') {
      setIdentifier('hassan.traders@gmail.com');
    } else if (role === 'supplier') {
      setIdentifier('ahmed@akenterprises.pk');
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      // Bounces back to the guarded destination when one was captured.
      login(selectedRole, redirectTo ?? undefined);
      showToast(`Welcome back! Logged in as ${selectedRole.toUpperCase()}`, 'success');
    }, 400);
  };

  return (
    <RedirectIfAuthed>
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
                <span>Verified supplier badges & NTN verification</span>
              </div>
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-asan-accent shrink-0" />
                <span>AI-powered demand forecasts & recommendations</span>
              </div>
              <div className="flex items-center gap-3">
                <CreditCard className="w-5 h-5 text-asan-accent shrink-0" />
                <span>JazzCash, EasyPaisa & Escrow Card Payments</span>
              </div>
              <div className="flex items-center gap-3">
                <Truck className="w-5 h-5 text-asan-accent shrink-0" />
                <span>Real-time nationwide order tracking</span>
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
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 mb-6">
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
                onClick={() => showToast('Password reset link sent to demo registered contact', 'info')}
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                Forgot password?
              </button>
            </div>

            <Button type="submit" isLoading={isLoading} className="w-full h-12 text-sm font-bold mt-2">
              Sign In as {selectedRole === 'shopkeeper' ? 'Shopkeeper' : 'Supplier'}
            </Button>
          </form>

          {/* Social login simulation */}
          <div className="mt-6">
            <div className="relative flex items-center justify-center">
              <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
              <span className="bg-white dark:bg-slate-900 px-3 text-[11px] text-slate-400 uppercase tracking-wider absolute">
                or continue with
              </span>
            </div>

            <button
              onClick={() => {
                login(selectedRole, redirectTo ?? undefined);
                showToast(`Logged in via Google as ${selectedRole.toUpperCase()}`);
              }}
              className="mt-4 w-full py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2 hover:bg-slate-100 transition"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Continue with Google</span>
            </button>
          </div>

          <p className="text-center text-xs text-slate-500 mt-6">
            New to Asan Tijarat?{' '}
            <Link href="/getstarted" className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline">
              Create account
            </Link>
          </p>
        </div>
      </div>

    </div>
    </RedirectIfAuthed>
  );
}