"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { PortalHeader } from '@/components/PortalHeader';
import { StatsCard } from '@/components/StatsCard';
import { OrderTable } from '@/components/OrderTable';
import { Loader } from '@/components/ui/loader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProductImage } from '@/components/ProductImage';
import { Users, Store, Package, ShieldCheck, UserCheck, Boxes, WalletCards, TrendingUp, Clock } from 'lucide-react';
import { KycDocumentViewer } from '@/components/KycDocumentViewer';
import { MapsLink } from '@/components/MapsLink';
import { api, AdminStats, AdminUser } from '@/lib/api';
import { useAuth } from '@/context/AuthProvider';
import { Order, Product } from '@/lib/types';
import { formatPKR, formatDate } from '@/lib/utils';

export default function AdminDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  // Newest listings — rendered with the photo the supplier uploaded.
  const [recentProducts, setRecentProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Registrations awaiting KYC approval — shown with their submitted details.
  const [pendingUsers, setPendingUsers] = useState<AdminUser[]>([]);
  const [verifyBusyId, setVerifyBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    // Wait for the auth provider to finish restoring the session from the httpOnly cookie.
    if (authLoading) return;

    let mounted = true;

    // No session — stop here, spinner must not run forever.
    if (!user) {
      if (mounted) setLoading(false);
      return;
    }

    // Not an admin — stop here, spinner must not run forever.
    if (user.role !== 'admin') {
      if (mounted) setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    Promise.allSettled([
      api.admin.stats(),
      api.admin.users({ verified: 'false' }),
      api.admin.products({}),
    ]).then((results) => {
      if (!mounted) return;

      const [statsRes, usersRes, productsRes] = results;

      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value.stats);
        setRecentOrders(statsRes.value.recentOrders);
      } else {
        setError(statsRes.reason instanceof Error ? statsRes.reason.message : 'Failed to load platform stats.');
      }

      if (usersRes.status === 'fulfilled') {
        setPendingUsers(usersRes.value.users.filter((u) => u.role !== 'admin'));
      }

      if (productsRes.status === 'fulfilled') {
        setRecentProducts(productsRes.value.products.slice(0, 6));
      }

      if (mounted) setLoading(false);
    }).catch(() => {
      if (mounted) setLoading(false);
    });

    return () => { mounted = false; };
  }, [authLoading, user]);

  /** Approve a pending registration — the trader can sign in immediately after. */
  const verifyAccount = async (u: AdminUser) => {
    setVerifyBusyId(u.id);
    setNotice(null);
    setError(null);
    try {
      await api.admin.verifyUser(u.id, true);
      setPendingUsers((prev) => prev.filter((p) => p.id !== u.id));
      setNotice(`${u.businessName || u.name} is verified and can now sign in with their credentials.`);

      // Refresh the KPIs + recent orders so "Pending KYC" updates instantly.
      const res = await api.admin.stats();
      setStats(res.stats);
      setRecentOrders(res.recentOrders);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify this account.');
    } finally {
      setVerifyBusyId(null);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader />
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8">
        <ShieldCheck className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Admins only</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          Please sign in with an admin account to continue.
        </p>
        <Link
          href="/signin?role=admin"
          className="inline-flex items-center gap-2 mt-5 px-5 py-2.5 rounded-xl bg-asan-accent hover:bg-asan-accent-hover text-white text-xs font-bold shadow-md transition"
        >
          Admin Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PortalHeader
        title="Admin Dashboard"
        subtitle="Platform overview • users, listings, orders and escrow revenue"
      />

      {error && (
        <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-700 dark:text-red-300">
          ⚠️ {error}
        </div>
      )}

      {loading || !stats ? (
        <div className="flex items-center justify-center py-20">
          <Loader />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <StatsCard title="Total Users" value={String(stats.users)} icon={Users} />
            <StatsCard title="Suppliers" value={String(stats.suppliers)} icon={Store} />
            <StatsCard title="Shopkeepers" value={String(stats.shopkeepers)} icon={UserCheck} />
            <StatsCard
              title="Pending KYC"
              value={String(stats.pendingVerifications)}
              change={stats.pendingVerifications > 0 ? `${stats.pendingVerifications} to review` : 'All verified'}
              isPositive={stats.pendingVerifications === 0}
              icon={ShieldCheck}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <StatsCard title="Products Listed" value={String(stats.products)} icon={Boxes} />
            <StatsCard title="Total Orders" value={String(stats.orders)} icon={Package} />
            <StatsCard title="Trade Volume" value={formatPKR(stats.revenue)} icon={WalletCards} />
            <StatsCard
              title="Platform Escrow Fees"
              value={formatPKR(stats.platformFees)}
              change="1.5% per order"
              isPositive
              icon={TrendingUp}
            />
          </div>

          {/* ── Pending KYC approvals ──────────────────────────────────────
              Every new shopkeeper/supplier registration lands here with the
              details they submitted plus a one-click Verify action. */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-500" />
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Pending Verifications</h3>
                {pendingUsers.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 text-[11px] font-bold">
                    {pendingUsers.length}
                  </span>
                )}
              </div>
              <Link href="/admin/users" className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline">
                Open KYC directory →
              </Link>
            </div>

            {notice && (
              <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm text-emerald-700 dark:text-emerald-300">
                ✅ {notice}
              </div>
            )}

            {pendingUsers.length === 0 ? (
              <div className="text-center py-10 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
                <UserCheck className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-500">No registrations are awaiting verification.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {pendingUsers.map((u) => (
                  <div
                    key={u.id}
                    className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 dark:text-white text-sm truncate">
                          {u.businessName || u.name}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">{u.name} • {u.email}</p>
                      </div>
                      <Badge variant={u.role === 'supplier' ? 'confirmed' : 'warning'}>
                        {u.role === 'supplier' ? 'Supplier' : 'Shopkeeper'}
                      </Badge>
                    </div>

                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                      {([
                        ['Business Category', u.category || '—'],
                        ['City / Mandi Hub', u.city || '—'],
                        ['House Address', u.houseAddress || '—'],
                        ['Current House Location', u.currentHouseLocation || '—'],
                        ['Live Location', <MapsLink key={u.id} user={u} />],
                        ['NTN Number', u.ntn || '—'],
                        ['Phone', u.phone],
                        ['Submitted', u.createdAt ? formatDate(u.createdAt) : '—'],
                      ] as const).map(([label, value]) => (
                        <div key={label}>
                          <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
                          <dd className="text-xs font-semibold text-slate-700 dark:text-slate-200 break-words">{value}</dd>
                        </div>
                      ))}
                    </dl>

                    {/* The CNIC front/back + NTN files submitted in Step 3 of
                        registration, shown before the admin approves the KYC. */}
                    <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                      <KycDocumentViewer
                        className="pt-3"
                        documents={u.documents}
                        ownerLabel={`${u.businessName || u.name} (${
                          u.role === 'supplier' ? 'Supplier' : 'Shopkeeper'
                        } · ${u.email})`}
                      />
                    </div>

                    <div className="flex items-center gap-3 pt-1">
                      <Button
                        size="sm"
                        disabled={verifyBusyId !== null}
                        isLoading={verifyBusyId === u.id}
                        onClick={() => void verifyAccount(u)}
                        className="flex items-center gap-1.5"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        Verify
                      </Button>
                      <Link
                        href="/admin/users"
                        className="text-[11px] font-bold text-slate-500 hover:text-asan-dark dark:hover:text-emerald-300"
                      >
                        Review full details
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Latest listings ──────────────────────────────────────────────
              Every thumbnail is the real photo the supplier attached in Add
              Product (/uploads/products/<file>), so moderators see exactly
              what buyers see — never a stock/placeholder image. */}
          {recentProducts.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Boxes className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Latest Listings</h3>
                </div>
                <Link href="/admin/products" className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline">
                  Manage all products →
                </Link>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {recentProducts.map((p) => (
                  <Link
                    key={p.id}
                    href="/admin/products"
                    className="group p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition space-y-2"
                  >
                    <ProductImage
                      src={p.image}
                      alt={p.name}
                      className="w-full aspect-square rounded-xl object-cover"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate" title={p.name}>
                        {p.name}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {formatPKR(p.price)} / {p.unit}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate" title={p.supplierName}>
                        by {p.supplierName}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Recent Orders</h3>
              <Link href="/admin/orders" className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline">
                Manage all →
              </Link>
            </div>
            <OrderTable orders={recentOrders} />
          </div>
        </>
      )}
    </div>
  );
}