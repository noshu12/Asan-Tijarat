// GROUP2-AUTH-FIX 2026-11-27
"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UserRole } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/context/AuthProvider';
import TurnstileWidget, { isTurnstileConfigured } from '@/components/TurnstileWidget';
import {
  ShieldCheck,
  Eye,
  EyeOff,
} from 'lucide-react';

const ROLE_HOME: Record<UserRole, string> = {
  shopkeeper: '/shopkeeper/dashboard',
  supplier: '/supplier/dashboard',
  admin: '/admin/dashboard',
  subadmin: '/admin/users',
};

// FIX (Batch 03) — ?redirect= sirf tab use karo jab wo safe same-site path
// ho: '/' se shuru ho, '//' se nahi (warna external site pe redirect ho
// jata — open-redirect attack), aur /signin pe wapas na le jaye (loop).
function safeRedirectTarget(value: string | null): string {
  if (!value) return '';
  if (!value.startsWith('/') || value.startsWith('//')) return '';
  if (value === '/signin' || value.startsWith('/signin?') || value.startsWith('/signin#')) return '';
  return value;
}

export default function SignInPage() {
  const router = useRouter();
  const { user, loading: authLoading, login: authLogin, verifyTwoFactorLogin: authVerify2FA, setTwoFactorSetupToken } = useAuth();
  const [tsToken, setTsToken] = useState<string | null>(null);
  const [tsKey, setTsKey] = useState(0);
  // Batch 17 (M3) — the 2FA code step has its OWN Turnstile widget: the
  // login token above is single-use and already spent on step 1, and
  // POST /api/auth/2fa/login is Turnstile-guarded now.
  const [twoFaTsToken, setTwoFaTsToken] = useState<string | null>(null);
  const [twoFaTsKey, setTwoFaTsKey] = useState(0);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [errorCode, setErrorCode] = useState('');
  // Admin 2FA step 2 — set when login() answers { requires2FA: true }.
  const [needs2FA, setNeeds2FA] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');

  // Already signed in: send the user to their destination, instead of
  // showing the sign-in form again.
  // FIX (Batch 03) — ?redirect= pehle parha jata tha phir ignore kar diya
  // jata tha (cart se login karke aaya banda dashboard pe phenk diya jata
  // tha). Ab safe ?redirect= ho to wahin jao, warna role ke dashboard pe.
  // URL se seedha parha jata hai (state pe bharosa nahi), taake pehli
  // render pe hi sahi jagah jaye — chahe login abhi hua ho ya 2FA ke baad.
  useEffect(() => {
    if (authLoading) return;
    if (user) {
      const redirect = safeRedirectTarget(
        new URLSearchParams(window.location.search).get('redirect')
      );
      router.push(redirect || ROLE_HOME[user.role] || '/');
    }
  }, [authLoading, user, router]);

  // Warm up likely destinations in the background so post-login navigation
  // feels instant (Next.js compiles routes lazily in dev mode).
  useEffect(() => {
    router.prefetch('/supplier/dashboard');
    router.prefetch('/shopkeeper/dashboard');
  }, [router]);

  // Calls POST /api/auth/login via the AuthProvider (sets the asan_token
  // httpOnly cookie), then redirects by the account's ACTUAL role — never
  // by a tab, because there is no tab any more. No token is stored in
  // localStorage and no Authorization header is sent.
  // Admins with 2FA enabled get { requires2FA: true } instead of a session —
  // then this page shows the 6-digit code step (handleTwoFactorSubmit).
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setErrorCode('');
    setIsLoading(true);

    try {
      const result = await authLogin(identifier.trim(), password, tsToken || undefined);
      if (result.requires2FASetup) {
        // Sub-admin first sign-in — 2FA setup is mandatory. The setup page
        // picks the short-lived token up from memory (AuthProvider state,
        // Batch 17 L3) — never sessionStorage, never the URL.
        setTwoFactorSetupToken(result.tempToken || '');
        router.push('/subadmin-setup');
        return;
      }
      if (result.requires2FA) {
        setTempToken(result.tempToken || '');
        setTwoFactorCode('');
        setNeeds2FA(true);
        setIsLoading(false);
        return;
      }
      // Normal sign-in: the already-signed-in useEffect above sends the user
      // to their actual-role dashboard once the AuthProvider user state updates.
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
        setErrorCode(err.code);
      } else {
        setErrorMessage('Unexpected error while signing in. Please try again.');
      }
      setIsLoading(false);
      setTsToken(null);
      setTsKey((k) => k + 1);
    }
  };

  // Admin 2FA step 2 — exchanges the tempToken + 6-digit authenticator code
  // for the normal session. Redirect happens via the useEffect watching user.
  const handleTwoFactorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setErrorCode('');
    setIsLoading(true);

    try {
      await authVerify2FA(tempToken, twoFactorCode, twoFaTsToken || undefined);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
        setErrorCode(err.code);
      } else {
        setErrorMessage('Unexpected error. Please try again.');
      }
      setIsLoading(false);
      // The Turnstile token is single-use — a failed attempt spent it,
      // so mint a fresh one for the retry.
      setTwoFaTsToken(null);
      setTwoFaTsKey((k) => k + 1);
    }
  };

  const backToPasswordStep = () => {
    setNeeds2FA(false);
    setTempToken('');
    setTwoFactorCode('');
    setErrorMessage('');
    setErrorCode('');
    setTwoFaTsToken(null);
    setTwoFaTsKey((k) => k + 1);
  };

  return (
    <>
      <div className="mb-5">
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
              {needs2FA ? 'Two-Factor Authentication' : 'Sign In'}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {needs2FA
                ? 'Enter the 6-digit code from your authenticator app'
                : 'Enter your credentials to continue'}
            </p>
          </div>

          {needs2FA ? (
            <form onSubmit={handleTwoFactorSubmit} className="space-y-4">
              <div className="flex items-center gap-3 rounded-2xl bg-asan-accent-light dark:bg-asan-dark/40 border border-asan-border dark:border-asan-mid px-4 py-3">
                <ShieldCheck className="w-8 h-8 text-asan-accent dark:text-asan-accent-light shrink-0" />
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Your password was correct. Enter the 6-digit code from your authenticator app to finish signing in.
                </p>
              </div>

              <Input
                label="Authentication code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
              />

              {errorMessage && (
                <p
                  role="alert"
                  className="text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5"
                >
                  {errorMessage}
                </p>
              )}

              {isTurnstileConfigured() && (
                <TurnstileWidget key={twoFaTsKey} onVerify={setTwoFaTsToken} onExpire={() => setTwoFaTsToken(null)} />
              )}

              <Button type="submit" isLoading={isLoading} className="w-full h-12 text-sm font-bold mt-2">
                Verify & Sign In
              </Button>

              <button
                type="button"
                onClick={backToPasswordStep}
                className="w-full text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                ← Use a different account
              </button>
            </form>
          ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              label="Phone or Email"
              type="text"
              autoComplete="username"
              placeholder="+92 300 1234567"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />

            <div className="space-y-1.5 relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="pr-14"
              />
              {/* FIX (Round-4 Batch 11, M6) — toggle was a bare 16px icon.
                  Now a full 44x44 tap target: the input is h-11 (44px)
                  starting 22px down (16px label + 6px gap), so top-[22px]
                  spans it exactly; pr-14 keeps typed text clear of it.
                  Button is transparent, so the look is unchanged. */}
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-1 top-[22px] flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            <div className="flex justify-end">
              <Link
                href="/forgot-password"
                className="text-xs font-semibold text-asan-accent dark:text-asan-accent-light hover:underline"
              >
                Forgot password?
              </Link>
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

            {isTurnstileConfigured() && (
              <TurnstileWidget key={tsKey} onVerify={setTsToken} onExpire={() => setTsToken(null)} />
            )}

            <Button type="submit" isLoading={isLoading} className="w-full h-12 text-sm font-bold mt-2">
              Sign In
            </Button>
          </form>
          )}

          {!needs2FA && (
            <p className="text-center text-xs text-slate-500 mt-6">
              New to Asan Tijarat?{' '}
              <Link href="/getstarted" className="font-bold text-asan-accent dark:text-asan-accent-light hover:underline">
                Create account
              </Link>
            </p>
          )}
    </>
  );
}
