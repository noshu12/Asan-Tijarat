"use client";

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Loader } from '@/components/ui/loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthProvider';

/**
 * /subadmin-setup — PUBLIC page for the mandatory first-time 2FA setup.
 * Reached only from /admin/login when adminLogin() answers
 * { requires2FASetup: true } — for the MAIN ADMIN as well as sub-admins
 * (FIX New audit #5: 2FA is mandatory for the main admin too). The
 * short-lived setup token comes from AuthProvider memory (Batch 17, L3)
 * — never sessionStorage, never the URL — so a refresh here means
 * signing in again (the token lives 5 minutes anyway).
 * After the first code is confirmed, sign in normally: password →
 * requires2FA → 6-digit code → session.
 */
export default function SubadminSetupPage() {
  const { twoFactorSetupToken, setTwoFactorSetupToken } = useAuth();
  const [phase, setPhase] = useState<'loading' | 'no-token' | 'scan' | 'done'>('loading');
  const [tempToken, setTempToken] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Setup must start exactly once even if the effect re-runs.
  const startedRef = useRef(false);

  useEffect(() => {
    const token = twoFactorSetupToken || '';
    if (!token) {
      setPhase('no-token');
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
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
  }, [twoFactorSetupToken]);

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
      // The setup token is single-use in practice — drop it from memory.
      setTwoFactorSetupToken('');
      setPhase('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Incorrect code. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-4rem)] flex items-center justify-center overflow-hidden p-6">
      {/* GROUP4-SETUP-FIX 2026-11-28 — shop-photo background, same as the
          admin login page (fill + object-cover = normal size, poori
          background cover). Is page par pehle koi background nahi tha;
          ab har login/2FA page par wohi picture hai. */}
      <Image
        src="/hero-bg.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="pointer-events-none object-cover"
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-white/55" />
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200/80 dark:border-slate-800 shadow-xl">
        {phase === 'loading' ? (
          <div className="flex flex-col items-center justify-center gap-3 py-6">
            <Loader />
            <p className="text-xs font-semibold text-slate-500">Preparing your secure setup…</p>
          </div>
        ) : phase === 'no-token' ? (
          <div className="flex flex-col items-center justify-center gap-3 text-center">
            <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">Setup session missing</p>
            <p className="text-sm text-slate-500 max-w-sm">
              {error || 'Please sign in with your admin account first — you will land here automatically.'}
            </p>
            <Link href="/signin" className="text-sm font-medium text-emerald-700 underline">
              Go to sign-in
            </Link>
          </div>
        ) : phase === 'done' ? (
          <div className="flex flex-col items-center justify-center gap-3 text-center">
            <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              Two-factor authentication enabled ✓
            </p>
            <p className="text-sm text-slate-500 max-w-sm">
              Your account is now secured. Sign in with your email + password, then enter the
              6-digit code from your authenticator app.
            </p>
            <Link href="/signin">
              <Button>Go to sign-in</Button>
            </Link>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-5">
            <div className="text-center max-w-md">
              <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                Secure your account
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Two-factor authentication is <strong>mandatory</strong> for admin accounts. Scan the QR
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
        )}
      </div>
    </div>
  );
}
