"use client";

import React, { useEffect, useState } from 'react';
import { PortalHeader } from '@/components/PortalHeader';
import { Loader } from '@/components/ui/loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Eye, EyeOff, ShieldCheck, Trash2, Users } from 'lucide-react';
import { api, AdminUser } from '@/lib/api';
import { useAuth } from '@/context/AuthProvider';
import { formatDate } from '@/lib/utils';

/**
 * /admin/subadmins — Sub-Admins management page (MAIN ADMIN ONLY).
 *
 * Rebuilt 2026-11-19: this file used to be a byte-for-byte copy of the
 * first-time 2FA setup page (/subadmin-setup), so opening it showed
 * "Setup session missing". That setup page is only for a NEW sub-admin's
 * first sign-in (scan the 2FA QR code). The main admin creates sub-admin
 * accounts HERE — list + create + delete. The backend routes
 * (GET/POST/DELETE /api/admin/subadmins) are main-admin only, and the
 * admin layout already blocks sub-admins from this path (AdminGate).
 * Do NOT touch /subadmin-setup — that flow must keep working as-is.
 */

// GROUP3-ADMIN-FIX 2026-11-28

export default function AdminSubadminsPage() {
  const { user, loading: authLoading } = useAuth();
  const [subs, setSubs] = useState<AdminUser[]>([]);
  const [count, setCount] = useState(0);
  const [max, setMax] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const loadSubadmins = async () => {
    setError(null);
    try {
      const res = await api.admin.subadmins();
      setSubs(res.subadmins || []);
      setCount(res.count ?? (res.subadmins || []).length);
      setMax(res.max ?? 10);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sub-admins');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== 'admin') {
      setLoading(false);
      return;
    }
    setLoading(true);
    void loadSubadmins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  // Client validation mirrors the backend createSubadmin rules exactly:
  // name/email/password required, valid email format, password min 8 chars.
  // Phone is optional (backend stores '-' when empty).
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setMessage(null);
    if (!name.trim() || !email.trim() || !password) {
      setFormError('Name, email and password are required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase())) {
      setFormError('Enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setFormError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.admin.createSubadmin(
        name.trim(),
        email.trim(),
        password,
        phone.trim() || undefined,
      );
      setMessage(
        `Sub-admin ${res.subadmin.name || res.subadmin.email} created. They must sign in once with this email + password to complete the mandatory 2FA setup before the account can be used.`,
      );
      setName('');
      setEmail('');
      setPassword('');
      setPhone('');
      await loadSubadmins();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create sub-admin.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (sub: AdminUser) => {
    if (!window.confirm(`Delete sub-admin ${sub.name} (${sub.email})? They will lose access immediately.`)) {
      return;
    }
    setDeletingId(sub.id);
    setMessage(null);
    setError(null);
    try {
      await api.admin.deleteSubadmin(sub.id);
      setMessage(`Sub-admin ${sub.name || sub.email} deleted.`);
      await loadSubadmins();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete sub-admin.');
    } finally {
      setDeletingId(null);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader />
      </div>
    );
  }

  // Main admin only. (Sub-admins never reach this page — the admin layout's
  // AdminGate shows them "Not authorized" for every /admin/* page except
  // /admin/users and /admin/messages — but guard the UI too.)
  if (!user || user.role !== 'admin') {
    return (
      <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8">
        <ShieldCheck className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Main admin only</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          Only the main admin can create and manage sub-admin accounts.
        </p>
      </div>
    );
  }

  const limitReached = count >= max;

  return (
    <div className="space-y-4">
      <PortalHeader
        title="Sub-Admins"
        subtitle="Create reviewer accounts — they get full admin access after the mandatory 2FA setup"
        hideSearch
      />
      {message && (
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          ✅ {message}
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300">
          ⚠️ {error}
        </div>
      )}

      {/* ── Create form ── */}
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-asan-accent" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Create Sub-Admin</h2>
          <span className="text-xs text-slate-500">
            ({count}/{max})
          </span>
        </div>
        {limitReached ? (
          <p className="text-sm text-slate-500">
            Maximum {max} sub-admin accounts reached. Delete one to create another.
          </p>
        ) : (
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {formError && (
              <div className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                {formError}
              </div>
            )}
            <Input
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              placeholder="Phone (optional)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password (min. 8 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button type="submit" isLoading={busy} disabled={busy} className="sm:col-span-2 w-full">
              Create Sub-Admin
            </Button>
          </form>
        )}
      </div>

      {/* ── List ── */}
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-5 h-5 text-asan-accent" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Sub-Admins</h2>
          <span className="text-xs text-slate-500">
            ({count}/{max})
          </span>
        </div>
        {subs.length === 0 ? (
          <p className="text-sm text-slate-500">
            No sub-admins yet — use the form above to create the first one.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {subs.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 rounded-2xl border border-slate-100 dark:border-slate-800 p-3"
              >
                <div className="w-10 h-10 shrink-0 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold text-sm">
                  {(s.name || s.email || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {s.name}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{s.email}</p>
                  <span
                    className={`inline-block mt-1 text-xs font-bold uppercase px-2 py-0.5 rounded-full ${
                      s.twoFactorEnabled
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {s.twoFactorEnabled ? '2FA On' : '2FA Pending'}
                  </span>
                  <p className="text-xs text-slate-400 mt-1">
                    Joined {s.createdAt ? formatDate(s.createdAt) : '—'}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleDelete(s)}
                  disabled={deletingId === s.id}
                  isLoading={deletingId === s.id}
                  className="shrink-0"
                  aria-label={`Delete sub-admin ${s.name || s.email}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
