"use client";

// Admin subdomain sign-in — /admin/login.
// This page ONLY exists on the admin host (see middleware.ts). It signs the
// admin/subadmin in via POST /api/auth/admin/login, which issues the
// host-only asan_admin_token cookie. The regular /signin page rejects admin
// accounts — they must come here.

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TurnstileWidget, { isTurnstileConfigured } from '@/components/TurnstileWidget';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/context/AuthProvider';

export default function AdminLoginPage() {
  const router = useRouter();
  // Batch 17 (L3) — the 2FA-setup tempToken travels in AuthProvider
  // memory, never sessionStorage.
  const { setTwoFactorSetupToken } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Turnstile (single-use token → reset the widget on every attempt).
  const [tsToken, setTsToken] = useState<string | null>(null);
  const [tsKey, setTsKey] = useState(0);

  // 2FA step 2 state.
  const [needs2FA, setNeeds2FA] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  // Batch 17 (M3) — the 2FA code step has its OWN Turnstile widget: the
  // login token above is single-use and already spent on step 1, and
  // POST /api/auth/admin/2fa/login is Turnstile-guarded now.
  const [twoFaTsToken, setTwoFaTsToken] = useState<string | null>(null);
  const [twoFaTsKey, setTwoFaTsKey] = useState(0);

  const resetTs = () => {
    setTsToken(null);
    setTsKey((k) => k + 1);
  };

  const resetTwoFaTs = () => {
    setTwoFaTsToken(null);
    setTwoFaTsKey((k) => k + 1);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    try {
      const result = await api.adminLogin(identifier.trim(), password, tsToken || undefined);

      if ('requires2FASetup' in result) {
        // Admin/sub-admin first sign-in without 2FA — setup is mandatory
        // (FIX New audit #5: the main admin uses this same flow now).
        // The setup token travels in memory (Batch 17, L3).
        setTwoFactorSetupToken(result.tempToken || '');
        router.push('/subadmin-setup');
        return;
      }
      if ('requires2FA' in result) {
        setTempToken(result.tempToken || '');
        setTwoFactorCode('');
        setNeeds2FA(true);
        setIsLoading(false);
        resetTs();
        return;
      }
      // Signed in — the host-only admin cookie is set. Go to the dashboard.
      window.location.assign('/admin/users');
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Unexpected error while signing in. Please try again.');
      }
      setIsLoading(false);
      resetTs();
    }
  };

  const handleTwoFactorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    try {
      await api.adminVerifyTwoFactorLogin(tempToken, twoFactorCode.trim(), twoFaTsToken || undefined);
      window.location.assign('/admin/users');
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Unexpected error. Please try again.');
      }
      setIsLoading(false);
      // The Turnstile token is single-use — a failed attempt spent it.
      resetTwoFaTs();
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200/80 dark:border-slate-800 shadow-xl">
        <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Admin Sign In</h3>
        <p className="text-xs text-slate-500 mt-1">
          {needs2FA
            ? 'Enter the 6-digit code from your authenticator app.'
            : 'Restricted area. Sign in with your admin account.'}
        </p>

        {!needs2FA ? (
          <form onSubmit={handleLogin} className="space-y-4 mt-6">
            <Input
              label="Email or Phone"
              type="text"
              placeholder="admin@example.com"
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
                className="pr-14"
              />
              {/* FIX (Round-4 Batch 11, M6) — toggle was a bare 16px icon;
                  now a full 44x44 tap target over the h-11 input
                  (top-[22px] = 16px label + 6px gap); pr-14 keeps typed
                  text clear of it. Look unchanged (transparent button). */}
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-1 top-[22px] flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            {errorMessage && (
              <p role="alert" className="text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5">
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
        ) : (
          <form onSubmit={handleTwoFactorSubmit} className="space-y-4 mt-6">
            <Input
              label="Authenticator Code"
              type="text"
              inputMode="numeric"
              placeholder="123456"
              value={twoFactorCode}
              onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
            />

            {errorMessage && (
              <p role="alert" className="text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5">
                {errorMessage}
              </p>
            )}

            {isTurnstileConfigured() && (
              <TurnstileWidget key={twoFaTsKey} onVerify={setTwoFaTsToken} onExpire={() => setTwoFaTsToken(null)} />
            )}

            <Button type="submit" isLoading={isLoading} className="w-full h-12 text-sm font-bold mt-2">
              Verify
            </Button>

            <button
              type="button"
              onClick={() => {
                setNeeds2FA(false);
                setTempToken('');
                setTwoFactorCode('');
                setErrorMessage('');
                resetTwoFaTs();
              }}
              className="w-full text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
