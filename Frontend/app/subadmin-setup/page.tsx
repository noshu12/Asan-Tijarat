"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader } from '@/components/ui/loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';

/**
 * /subadmin-setup — PUBLIC page for the mandatory first-time 2FA setup.
 * Reached only from sign-in when login() answers { requires2FASetup: true }.
 * The short-lived setup token comes from sessionStorage (never the URL).
 * After the first code is confirmed, the sub-admin signs in normally:
 * password → requires2FA → 6-digit code → session.
 */
export default function SubadminSetupPage() {
  const [phase, setPhase] = useState<'loading' | 'no-token' | 'scan' | 'done'>('loading');
  const [tempToken, setTempToken] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = sessionStorage.getItem('subadmin_setup_token') || '';
    if (!token) {
      setPhase('no-token');
      return;
    }
    setTempToken(token);
    (async () => {
      try {
        const res = await api.setupTwoFactorFirst(token);
        setQrDataUrl(res.qrDataUrl);
        setOtpauthUrl(res.otpauthUrl);
        setPhase('scan');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not start setup. Please sign in again.');
        setPhase('no-token');
      }
    })();
  }, []);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setBusy(true);
    try {
      await api.verifyTwoFactorSetupFirst(tempToken, code.trim());
      sessionStorage.removeItem('subadmin_setup_token');
      setPhase('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Incorrect code. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader />
        <p className="text-xs font-semibold text-slate-500">Preparing your secure setup…</p>
      </div>
    );
  }

  if (phase === 'no-token') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-6">
        <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">Setup session missing</p>
        <p className="text-sm text-slate-500 max-w-sm">
          {error || 'Please sign in with your sub-admin account first — you will land here automatically.'}
        </p>
        <Link href="/signin" className="text-sm font-medium text-emerald-700 underline">
          Go to sign-in
        </Link>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-6">
        <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          Two-factor authentication enabled ✓
        </p>
        <p className="text-sm text-slate-500 max-w-sm">
          Your reviewer account is now secured. Sign in with your email + password, then enter the
          6-digit code from your authenticator app.
        </p>
        <Link href="/signin">
          <Button>Go to sign-in</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center min-h-[60vh] gap-5 px-6 py-10">
      <div className="text-center max-w-md">
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
          Secure your reviewer account
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Two-factor authentication is <strong>mandatory</strong> for reviewer accounts. Scan the QR
          code with Google Authenticator (or any authenticator app), then enter the 6-digit code
          below to finish setup.
        </p>
      </div>

      {qrDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrDataUrl} alt="2FA QR code" className="h-52 w-52 rounded-xl border border-slate-200 bg-white p-2" />
      )}
      {otpauthUrl && (
        <p className="text-xs text-slate-400 max-w-md break-all text-center">
          Can&apos;t scan? Add this key manually in your authenticator app.
        </p>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 max-w-md w-full">
          {error}
        </div>
      )}

      <form onSubmit={handleVerify} className="flex flex-col gap-3 w-full max-w-xs">
        <Input
          placeholder="6-digit code"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="text-center text-lg tracking-[0.3em]"
        />
        <Button type="submit" isLoading={busy} disabled={busy || code.trim().length !== 6}>
          Enable 2FA
        </Button>
      </form>
    </div>
  );
}
