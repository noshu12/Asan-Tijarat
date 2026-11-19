"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ShieldCheck, ShieldOff, Eye, EyeOff } from 'lucide-react';

type Phase = 'loading' | 'disabled' | 'setup' | 'enabled' | 'disabling';

/**
 * Two-factor authentication card for the shopkeeper and supplier portals.
 * Rendered inside SettingsView (Account Settings), below the password card.
 *
 * FIX (New audit #15) — TOTP 2FA is now OPTIONAL for supplier + shopkeeper
 * accounts, using the exact same endpoints the admin security page uses
 * (POST /api/auth/2fa/setup → /verify-setup → /disable). The sign-in page
 * already shows the 6-digit code step whenever login() answers
 * { requires2FA: true }, so no sign-in change was needed.
 *
 * Flow: Enable → scan the QR with an authenticator app → enter the first
 * 6-digit code to confirm → every later sign-in asks for a code after the
 * password. Disable asks for the current password. 2FA stays OFF until the
 * first code is confirmed, so a wrongly scanned QR can never lock the
 * account out — and accounts that never enable it sign in exactly as before.
 */
export function TwoFactorSettings({ role }: { role: 'shopkeeper' | 'supplier' }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [manualKey, setManualKey] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const roleLabel = role === 'supplier' ? 'supplier' : 'shopkeeper';

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
    <div className="p-8 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-6">
      <div>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
          Two-Factor Authentication
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Optional extra security for your {roleLabel} account — a 6-digit code after your password
        </p>
      </div>

      {notice && (
        <p
          role="status"
          className="text-xs font-semibold leading-relaxed text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-2.5"
        >
          {notice}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5"
        >
          {error}
        </p>
      )}

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
            // QR is a data: URL — next/image cannot optimise it (same as the
            // sub-admin setup page and the admin security page).
            // eslint-disable-next-line @next/next/no-img-element
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
            <ShieldCheck className="w-10 h-10 text-asan-accent dark:text-asan-accent-light shrink-0" />
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
          <div className="space-y-1.5 relative">
            <Input
              label="Current password"
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
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
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
  );
}
