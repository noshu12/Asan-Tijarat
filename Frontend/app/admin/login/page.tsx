"use client";

// Admin subdomain sign-in — /admin/login.
// This page ONLY exists on the admin host (see middleware.ts). It signs the
// admin/subadmin in via POST /api/auth/admin/login, which issues the
// host-only asan_admin_token cookie. The regular /signin page rejects admin
// accounts — they must come here.

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import TurnstileWidget, { isTurnstileConfigured } from '@/components/TurnstileWidget';
import { api, ApiError } from '@/lib/api';

export default function AdminLoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Turnstile (single-use token → reset the widget on every attempt).
  const [tsToken, setTsToken] = useState<string | null>(null);
  const [tsKey, setTsKey] = useState(0);

  // 2FA step 2 state.
  const [needs2FA, setNeeds2FA] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');

  const resetTs = () => {
    setTsToken(null);
    setTsKey((k) => k + 1);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    try {
      const result = await api.adminLogin(identifier.trim(), password, tsToken || undefined);

      if ('requires2FASetup' in result) {
        // Sub-admin first sign-in — 2FA setup is mandatory.
        sessionStorage.setItem('subadmin_setup_token', result.tempToken || '');
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
      router.refresh();
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
      await api.adminVerifyTwoFactorLogin(tempToken, twoFactorCode.trim());
      window.location.assign('/admin/users');
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Unexpected error. Please try again.');
      }
      setIsLoading(false);
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
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

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
