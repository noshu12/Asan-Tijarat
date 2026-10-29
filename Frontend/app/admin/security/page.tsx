"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ShieldCheck, ShieldOff } from 'lucide-react';

type Phase = 'loading' | 'disabled' | 'setup' | 'enabled' | 'disabling';

/**
 * /admin/security — admin-only (the admin layout already wraps this page in
 * RequireAuth role="admin"). Manage TOTP two-factor authentication:
 * scan the QR with an authenticator app, confirm the first code to enable,
 * or disable again with the current password.
 */
export default function AdminSecurityPage() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [manualKey, setManualKey] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      setPhase(me.user.twoFactorEnabled ? 'enabled' : 'disabled');
    } catch {
      setError('Could not load your security status. Refresh the page and try again.');
      setPhase('disabled');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const fail = (err: unknown, fallback: string) => {
    setError(err instanceof ApiError ? err.message : fallback);
  };

  const startSetup = async () => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const res = await api.setupTwoFactor();
      setQrDataUrl(res.qrDataUrl);
      try {
        setManualKey(new URL(res.otpauthUrl).searchParams.get('secret') || '');
      } catch {
        setManualKey('');
      }
      setCode('');
      setPhase('setup');
    } catch (err) {
      fail(err, 'Could not start setup. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirmSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.verifyTwoFactorSetup(code);
      setNotice('Two-factor authentication is now enabled. You will be asked for a code on every sign-in.');
      setPhase('enabled');
    } catch (err) {
      fail(err, 'Could not verify the code. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const disable = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.disableTwoFactor(password);
      setPassword('');
      setNotice('Two-factor authentication has been disabled.');
      setPhase('disabled');
    } catch (err) {
      fail(err, 'Could not disable. Check your password and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Security</h1>
        <p className="text-sm text-slate-500 mt-1">
          Two-factor authentication for your admin account
        </p>
      </div>

      {notice && (
        <p
          role="status"
          className="mb-4 text-xs font-semibold leading-relaxed text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-2.5"
        >
          {notice}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mb-4 text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5"
        >
          {error}
        </p>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200/80 dark:border-slate-800 shadow-xl">
        {phase === 'loading' && (
          <p className="text-sm text-slate-500">Loading your security status…</p>
        )}

        {phase === 'disabled' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <ShieldOff className="w-10 h-10 text-slate-400 shrink-0" />
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white">Two-factor authentication is off</h2>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Add an authenticator app (Google Authenticator, Microsoft Authenticator, …)
                  as a second step after your password.
                </p>
              </div>
            </div>
            <Button onClick={startSetup} isLoading={busy} className="h-11 text-sm font-bold">
              Enable two-factor authentication
            </Button>
          </div>
        )}

        {phase === 'setup' && (
          <form onSubmit={confirmSetup} className="space-y-4">
            <h2 className="font-bold text-slate-900 dark:text-white">Scan this QR code</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Open your authenticator app, add a new account and scan the code below.
              Then enter the 6-digit code it shows to confirm.
            </p>
            {qrDataUrl && (
              <img
                src={qrDataUrl}
                alt="Two-factor setup QR code"
                className="w-52 h-52 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white p-2"
              />
            )}
            {manualKey && (
              <p className="text-xs text-slate-500 break-all">
                Can&apos;t scan? Enter this key manually:{' '}
                <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{manualKey}</span>
              </p>
            )}
            <Input
              label="Authentication code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
            />
            <div className="flex gap-3">
              <Button type="submit" isLoading={busy} className="h-11 text-sm font-bold">
                Verify & Enable
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPhase('disabled')}
                className="h-11 text-sm"
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        {phase === 'enabled' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-10 h-10 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white">Two-factor authentication is on</h2>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  You will be asked for a 6-digit code from your authenticator app on every sign-in.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => { setError(''); setPassword(''); setPhase('disabling'); }}
              className="h-11 text-sm font-bold"
            >
              Disable
            </Button>
          </div>
        )}

        {phase === 'disabling' && (
          <form onSubmit={disable} className="space-y-4">
            <h2 className="font-bold text-slate-900 dark:text-white">Disable two-factor authentication</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Enter your current password to confirm. Your account will then sign in with password only.
            </p>
            <Input
              label="Current password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <div className="flex gap-3">
              <Button type="submit" isLoading={busy} className="h-11 text-sm font-bold">
                Disable 2FA
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPhase('enabled')}
                className="h-11 text-sm"
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
