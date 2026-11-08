"use client";

import React, { useEffect, useState } from 'react';
import { PortalHeader } from '@/components/PortalHeader';
import { Loader } from '@/components/ui/loader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Ban, ChevronDown, Search, ShieldCheck, Trash2, UserCheck, Users } from 'lucide-react';
import Link from 'next/link';
import { KycDocumentViewer } from '@/components/KycDocumentViewer';
import { MapsLink } from '@/components/MapsLink';
import { api, AdminUser } from '@/lib/api';
import { useAuth } from '@/context/AuthProvider';
import { cn, formatDate } from '@/lib/utils';

// Admin list se aane wale user me emailVerified ho sakta hai, lekin
// AdminUser type me ye field lazmi nahi hai, isliye safe tareeqe se parha hai.
function isOtpVerified(u: AdminUser): boolean {
  return Boolean((u as unknown as { emailVerified?: boolean }).emailVerified);
}

// Backend status na aaye (purana response) to verified se andaza lagao.
function getStatus(u: AdminUser): string {
  return u.status || (u.verified ? 'active' : 'pending');
}

function statusLabel(status: string): string {
  if (status === 'active') return 'Active';
  if (status === 'suspended') return 'Suspended';
  if (status === 'rejected') return 'Rejected';
  return 'Pending';
}

// Identity numbers are encrypted at rest — the users list API never sends
// them. The admin reveals one user's numbers per click; every view is
// written to the audit log on the backend.
function SensitiveValue({
  userId,
  field,
}: {
  userId: string;
  field: 'cnic' | 'ntn' | 'utilityBillAccountNumber';
}) {
  const [value, setValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reveal = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.getDecryptedIdentity(userId);
      setValue(res.identity[field] || '—');
    } catch {
      setError('Could not load.');
    } finally {
      setLoading(false);
    }
  };

  if (value !== null) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="font-mono">{value}</span>
        <button
          type="button"
          onClick={() => setValue(null)}
          className="text-xs text-slate-500 underline hover:text-slate-700"
        >
          Hide
        </button>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono">••••••</span>
      <button
        type="button"
        onClick={reveal}
        disabled={loading}
        className="text-xs text-emerald-700 underline hover:text-emerald-900 disabled:opacity-50"
      >
        {loading ? 'Loading…' : error ?? 'View'}
      </button>
    </span>
  );
}

export default function AdminUsersPage() {
  const { user, loading: authLoading } = useAuth();
  // REVISED (Batch 02, 2026-11-09) — Noushad ka faisla: sub-admin ko FULL
  // access hai, jo kuch main admin kar sakta hai wohi sub-admin bhi kar
  // sakta hai. Is liye Suspend / Activate / Reject / Delete buttons
  // sub-admin ko bhi dikhte hain (pehle wali Batch 02 me chhupaye thay,
  // wo faisla badal gaya hai).
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roleFilter, setRoleFilter] = useState('all');
  const [verifiedFilter, setVerifiedFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadUsers = async () => {
    setError(null);
    try {
      const res = await api.admin.users({ role: roleFilter, verified: verifiedFilter, search: search.trim() || undefined });
      if (!res) return;
      const list = Array.isArray(res) ? res : ((res as { users?: AdminUser[] }).users || []);
      setUsers(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    // Sub-admins share this page (verify/unverify + KYC view only).
    if (!user || (user.role !== 'admin' && user.role !== 'subadmin')) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void loadUsers();
  }, [authLoading, user]);

  const runAction = async (action: () => Promise<unknown>, ok: string) => {
    setBusyId('all');
    setMessage(null);
    setError(null);
    try {
      await action();
      setMessage(ok);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusyId(null);
    }
  };

  const toggleVerified = (u: AdminUser) =>
    runAction(
      () => api.admin.verifyUser(u.id, !u.verified),
      u.verified
        ? `Verification revoked for ${u.name}. They can no longer sign in.`
        : `${u.name} verified — they can now sign in with their registered credentials.`
    );

  const suspendAccount = (u: AdminUser) => {
    const reason = window.prompt(`Suspend ${u.name}? Enter the reason that will be emailed to them:`);
    if (reason === null) return;
    if (!reason.trim()) {
      setError('A reason is required to suspend an account.');
      return;
    }
    void runAction(
      () => api.admin.suspendUser(u.id, reason.trim()),
      `${u.name} suspended — a suspension email with the reason was sent.`
    );
  };

  const activateAccount = (u: AdminUser) =>
    runAction(
      () => api.admin.activateUser(u.id),
      `${u.name} activated — they can sign in again.`
    );

  const rejectAccount = (u: AdminUser) => {
    const reason = window.prompt(`Reject ${u.name}'s registration? Enter the reason that will be emailed to them:`);
    if (reason === null) return;
    if (!reason.trim()) {
      setError('A reason is required to reject an account.');
      return;
    }
    void runAction(
      () => api.admin.rejectUser(u.id, reason.trim()),
      `${u.name} rejected — a rejection email with the reason was sent.`
    );
  };

  const removeUser = (u: AdminUser) =>
    runAction(
      () => api.admin.deleteUser(u.id),
      `${u.name}'s account (and their listings) was deleted.`
    );

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader />
      </div>
    );
  }

  // Sub-admins share this page with the main admin — full access,
  // same buttons as the main admin (Noushad ka faisla, 2026-11-09).
  if (!user || (user.role !== 'admin' && user.role !== 'subadmin')) {
    return (
      <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8">
        <ShieldCheck className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Admins only</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">Sign in with an admin or reviewer account to manage users and KYC.</p>
      </div>
    );
  }

  const isMainAdmin = user?.role === 'admin';
  // Three separate boxes: admins, sub-admins, and regular users.
  const adminUsers = users.filter((u) => u.role === 'admin');
  const subadminUsers = users.filter((u) => u.role === 'subadmin');

  const filteredUsers = users.filter((u) => {
    if (u.role === 'admin' || u.role === 'subadmin') return false; // own boxes above
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (verifiedFilter === 'true' && !u.verified) return false;
    if (verifiedFilter === 'false' && u.verified) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${u.name} ${u.email} ${u.phone || ''} ${u.businessName || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <PortalHeader
        title="Users & KYC"
        subtitle="Approve, suspend, activate or reject shopkeeper/supplier accounts"
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
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search name, email, phone or business..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 w-full rounded-xl border border-slate-200 bg-white text-xs dark:bg-slate-900 dark:border-slate-800 dark:text-white focus:outline-none focus:border-asan-accent transition"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs dark:bg-slate-900 dark:border-slate-800 dark:text-white focus:outline-none"
        >
          <option value="all">All Roles</option>
          <option value="supplier">Suppliers</option>
          <option value="shopkeeper">Shopkeepers</option>
        </select>
        <select
          value={verifiedFilter}
          onChange={(e) => setVerifiedFilter(e.target.value)}
          className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs dark:bg-slate-900 dark:border-slate-800 dark:text-white focus:outline-none"
        >
          <option value="all">Verified: All</option>
          <option value="true">Verified</option>
          <option value="false">Pending KYC</option>
        </select>
        <Button type="button" variant="outline" onClick={() => void loadUsers()}>
          Apply
        </Button>
      </div>
      {/* ── Box 1: Administrators (main admin only) ── */}
      {isMainAdmin && !loading && adminUsers.length > 0 && (
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-5 h-5 text-asan-accent" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Administrators</h2>
            <span className="text-xs text-slate-500">({adminUsers.length})</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {adminUsers.map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 dark:border-slate-800 p-3">
                <div className="w-10 h-10 shrink-0 rounded-full bg-asan-accent/15 text-asan-accent flex items-center justify-center font-bold text-sm">
                  {(a.name || a.email || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {a.name}
                    {a.id === user?.id && (
                      <span className="ml-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-asan-accent/15 text-asan-accent">You</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{a.email}</p>
                  <p className="text-xs text-slate-400">Joined {a.createdAt ? formatDate(a.createdAt) : '—'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* ── Box 2: Sub-Admins (main admin only) ── */}
      {isMainAdmin && !loading && (
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-asan-accent" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Sub-Admins</h2>
              <span className="text-xs text-slate-500">({subadminUsers.length}/10)</span>
            </div>
            <Link href="/admin/subadmins" className="text-xs font-semibold text-asan-accent hover:underline">
              Manage →
            </Link>
          </div>
          {subadminUsers.length === 0 ? (
            <p className="text-xs text-slate-500">No sub-admins yet — create them from the Sub-Admins page.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {subadminUsers.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 dark:border-slate-800 p-3">
                  <div className="w-10 h-10 shrink-0 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold text-sm">
                    {(s.name || s.email || '?')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{s.name}</p>
                    <p className="text-xs text-slate-500 truncate">{s.email}</p>
                    <span className={`inline-block mt-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${s.twoFactorEnabled ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'}`}>
                      {s.twoFactorEnabled ? '2FA On' : '2FA Pending'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {/* ── Box 3: regular users (shopkeepers & suppliers) ── */}
      <div className="flex items-center gap-2">
        <UserCheck className="w-5 h-5 text-asan-accent" />
        <h2 className="text-base font-bold text-slate-900 dark:text-white">Users</h2>
        <span className="text-xs text-slate-500">Shopkeepers & Suppliers</span>
      </div>
      {loading ? (
        <Loader />
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
          <UserCheck className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No users match the selected filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">KYC</th>
                <th className="px-4 py-3">OTP</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredUsers.map((u) => {
                const isOpen = expandedId === u.id;
                const status = getStatus(u);
                // Detail rows differ per role — shopkeepers have a shop type +
                // utility bill (no NTN, no category); suppliers have NTN +
                // categories (no shop type, no utility bill).
                const shopkeeperView = u.role === 'shopkeeper';
                const detailRows: { label: string; value: React.ReactNode }[] = [
                  { label: shopkeeperView ? 'Shop Name' : 'Business / Enterprise', value: u.businessName || '—' },
                  { label: 'Full Name', value: u.name },
                  shopkeeperView
                    ? { label: 'Shop Type', value: u.shopType || '—' }
                    : { label: 'Business Category', value: u.category || '—' },
                  { label: 'City / Mandi Hub', value: u.city || '—' },
                  shopkeeperView
                    ? { label: 'House Address', value: u.houseAddress || '—' }
                    : { label: 'Warehouse Address', value: u.houseAddress || '—' },
                  shopkeeperView
                    ? { label: 'Shop Location', value: u.shopLocation || '—' }
                    : { label: 'Warehouse Location', value: u.currentHouseLocation || '—' },
                  { label: 'Live Location', value: <MapsLink key={u.id} user={u} /> },
                  shopkeeperView
                    ? {
                        label: 'Utility Bill Account Number',
                        value: (
                          <SensitiveValue key={`bill-${u.id}`} userId={u.id} field="utilityBillAccountNumber" />
                        ),
                      }
                    : {
                        label: 'NTN Number',
                        value: <SensitiveValue key={`ntn-${u.id}`} userId={u.id} field="ntn" />,
                      },
                  {
                    label: 'Account Type',
                    value: u.role === 'supplier' ? 'Supplier' : u.role === 'shopkeeper' ? 'Shopkeeper' : 'Admin',
                  },
                  { label: 'Status', value: statusLabel(status) },
                  { label: 'Suspension Reason', value: u.suspensionReason || '—' },
                  { label: 'Rejection Reason', value: u.rejectionReason || '—' },
                  { label: 'Email', value: u.email },
                  { label: 'Email OTP', value: u.role === 'admin' ? '—' : isOtpVerified(u) ? 'Verified' : 'Pending' },
                  { label: 'Phone', value: u.phone },
                  { label: 'Registered On', value: u.createdAt ? formatDate(u.createdAt) : '—' },
                ];
                return (
                  <React.Fragment key={u.id}>
                    <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setExpandedId(isOpen ? null : u.id)}
                          aria-expanded={isOpen}
                          title="Show the details this trader submitted at registration"
                          className="flex items-center gap-2.5 text-left"
                        >
                          {u.avatar ? (
                              <img src={u.avatar} alt="" className="w-8 h-8 rounded-full object-cover bg-slate-100" />
                            ) : (
                              <span className="w-8 h-8 shrink-0 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">
                                {(u.name || '?').trim().charAt(0).toUpperCase()}
                              </span>
                            )}
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white text-xs truncate">
                              {u.businessName || u.name}
                            </p>
                            <p className="text-[11px] text-slate-400">{u.name} · {u.city || '—'}</p>
                          </div>
                          <ChevronDown
                            className={cn(
                              'w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform',
                              isOpen && 'rotate-180'
                            )}
                          />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                        {u.email}
                        <p className="text-[11px] text-slate-400">{u.phone}</p>
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200">
                        {u.role === 'supplier' ? 'Supplier' : u.role === 'shopkeeper' ? 'Shopkeeper' : 'Admin'}
                      </td>
                      <td className="px-4 py-3">
                        {status === 'active' ? (
                          <Badge variant="verified">Active</Badge>
                        ) : status === 'pending' ? (
                          <Badge variant="pending">Pending</Badge>
                        ) : status === 'suspended' ? (
                          <Badge variant="warning">Suspended</Badge>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
                            Rejected
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={u.verified ? 'verified' : 'pending'}>
                          {u.verified ? 'Verified' : 'Pending KYC'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {u.role === 'admin' ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : (
                          <Badge variant={isOtpVerified(u) ? 'verified' : 'pending'}>
                            {isOtpVerified(u) ? 'OTP Verified' : 'OTP Pending'}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {u.createdAt ? formatDate(u.createdAt) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {u.role !== 'admin' && u.role !== 'subadmin' && (
                            <Button
                              size="sm"
                              variant={u.verified ? 'outline' : 'primary'}
                              disabled={busyId !== null || (!u.verified && !isOtpVerified(u)) || status === 'suspended' || status === 'rejected'}
                              onClick={() => void toggleVerified(u)}
                              className="flex items-center gap-1.5"
                              title={
                                status === 'suspended' || status === 'rejected'
                                  ? 'Suspended or rejected accounts cannot be verified here — use Activate for a suspended account'
                                  : u.verified
                                    ? 'Revoke verification'
                                    : isOtpVerified(u)
                                      ? 'Verify this registration'
                                      : 'Email OTP not verified yet — verify OTP first'
                              }
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              {u.verified ? 'Unverify' : 'Verify'}
                            </Button>
                          )}
                          {u.role !== 'admin' && u.role !== 'subadmin' && status !== 'suspended' && status !== 'rejected' && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyId !== null}
                              onClick={() => suspendAccount(u)}
                              className="flex items-center gap-1.5"
                              title="Suspend this account and email the reason"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              Suspend
                            </Button>
                          )}
                          {u.role !== 'admin' && u.role !== 'subadmin' && status === 'suspended' && (
                            <Button
                              size="sm"
                              variant="primary"
                              disabled={busyId !== null}
                              onClick={() => void activateAccount(u)}
                              className="flex items-center gap-1.5"
                              title="Activate this suspended account again"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              Activate
                            </Button>
                          )}
                          {u.role !== 'admin' && u.role !== 'subadmin' && status === 'pending' && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyId !== null}
                              onClick={() => rejectAccount(u)}
                              className="flex items-center gap-1.5"
                              title="Reject this registration and email the reason"
                            >
                              Reject
                            </Button>
                          )}
                          {u.role !== 'admin' && u.role !== 'subadmin' && (
                            <button
                              type="button"
                              title="Delete account"
                              disabled={busyId !== null}
                              onClick={() => {
                                if (window.confirm(`Delete ${u.name}'s account and all their listings?`)) void removeUser(u);
                              }}
                              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-slate-50/70 dark:bg-slate-800/30">
                        <td colSpan={8} className="px-4 py-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
                            {detailRows.map(({ label, value }) => (
                              <div key={label}>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
                                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 break-words">
                                  {value}
                                </p>
                              </div>
                            ))}
                          </div>
                          <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700">
                            <KycDocumentViewer
                              userId={u.id}
                              role={u.role}
                              documents={u.documents}
                              ownerLabel={`${u.businessName || u.name} (${
                                u.role === 'supplier' ? 'Supplier' : u.role === 'shopkeeper' ? 'Shopkeeper' : 'Admin'
                              } · ${u.email})`}
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

