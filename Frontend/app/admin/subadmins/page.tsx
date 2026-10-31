"use client";

import React, { useEffect, useState } from 'react';
import { PortalHeader } from '@/components/PortalHeader';
import { Loader } from '@/components/ui/loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Trash2, UserPlus } from 'lucide-react';
import { api, AdminUser } from '@/lib/api';
import { useAuth } from '@/context/AuthProvider';
import { formatDate } from '@/lib/utils';

/**
 * /admin/subadmins — main admin only.
 * Create and manage up to 10 sub-admin (KYC reviewer) accounts.
 * A new sub-admin MUST finish the mandatory 2FA setup on their first
 * sign-in — without it, no session is ever issued.
 */
export default function AdminSubadminsPage() {
  const { user, loading: authLoading } = useAuth();
  const [subs, setSubs] = useState<AdminUser[]>([]);
  const [max, setMax] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const res = await api.admin.subadmins();
      setSubs(res.subadmins || []);
      setMax(res.max || 10);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sub-admins');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (user?.role !== 'admin') return;
    load();
  }, [authLoading, user]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!name.trim() || !email.trim() || !password) {
      setError('Name, email and password are required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setCreating(true);
    try {
      await api.admin.createSubadmin(name.trim(), email.trim(), password, phone.trim() || undefined);
      setMessage(
        `Sub-admin account created for ${email.trim()}. They must complete the 2FA setup on their first sign-in.`
      );
      setName('');
      setEmail('');
      setPhone('');
      setPassword('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create sub-admin');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, emailAddr: string) => {
    if (!window.confirm(`Delete the sub-admin account ${emailAddr}? They will lose access immediately.`)) return;
    setError(null);
    setMessage(null);
    setBusyId(id);
    try {
      await api.admin.deleteSubadmin(id);
      setMessage('Sub-admin account deleted.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete sub-admin');
    } finally {
      setBusyId(null);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader />
        <p className="text-xs font-semibold text-slate-500">Loading sub-admins…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PortalHeader
        title="Sub-Admins"
        subtitle="KYC reviewers — they verify users and view KYC documents only."
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Create sub-admin
          </h2>
          <Badge variant={subs.length >= max ? 'warning' : 'active'}>
            {subs.length} / {max}
          </Badge>
        </div>
        <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-2">
          <Input
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={creating || subs.length >= max}
          />
          <Input
            placeholder="Email address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={creating || subs.length >= max}
          />
          <Input
            placeholder="Phone (optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={creating || subs.length >= max}
          />
          <Input
            placeholder="Password (min 8 characters)"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={creating || subs.length >= max}
          />
          <div className="sm:col-span-2">
            <Button type="submit" isLoading={creating} disabled={creating || subs.length >= max}>
              Create sub-admin account
            </Button>
            <p className="mt-2 text-xs text-slate-500">
              The new sub-admin signs in with this email + password, then MUST scan the 2FA QR
              on first sign-in — no session is issued without it.
            </p>
          </div>
        </form>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">2FA</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {subs.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                <td className="px-4 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3">{s.email}</td>
                <td className="px-4 py-3">
                  <Badge variant={(s as unknown as { twoFactorEnabled?: boolean }).twoFactorEnabled ? 'verified' : 'warning'}>
                    {(s as unknown as { twoFactorEnabled?: boolean }).twoFactorEnabled ? 'Enabled' : 'Pending setup'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {s.createdAt ? formatDate(s.createdAt) : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="outline"
                    onClick={() => handleDelete(s.id, s.email)}
                    disabled={busyId === s.id}
                    isLoading={busyId === s.id}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {subs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No sub-admin accounts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
