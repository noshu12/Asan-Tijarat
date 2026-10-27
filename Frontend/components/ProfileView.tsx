"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ProductCard } from '@/components/ProductCard';
import { StatsCard } from '@/components/StatsCard';
import { Badge } from '@/components/ui/badge';
import { Loader } from '@/components/ui/loader';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthProvider';
import { Order, Product, User } from '@/lib/types';
import { formatDate, formatPKR, googleMapsUrl } from '@/lib/utils';
import {
  Building2,
  Clock,
  CreditCard,
  Home,
  Mail,
  MapPin,
  Navigation,
  Package,
  Pencil,
  Phone,
  ShieldCheck,
  ShoppingCart,
  Star,
} from 'lucide-react';

/**
 * Shared business-profile screen for the shopkeeper and supplier portals.
 *
 * Everything on this page comes from the signed-in session
 * (GET /api/auth/me) plus that account's own rows — no mock data. The supplier
 * variant additionally renders the live catalogue owned by the account.
 */

type ProfileUser = User & { createdAt?: string };

interface ProfileViewProps {
  role: 'shopkeeper' | 'supplier';
}

const ROLE_LABEL: Record<ProfileViewProps['role'], string> = {
  shopkeeper: 'Shopkeeper',
  supplier: 'Supplier',
};

export function ProfileView({ role }: ProfileViewProps) {
  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1) Paint the cached session immediately, then refresh it from the server
  //    (GET /api/auth/me) so the page never shows stale profile details.
  useEffect(() => {
    let mounted = true;

    api
      .me()
      .then((res) => {
        if (!mounted) return;
        setProfile(res.user);
        setUserId(res.user.id);
      })
      .catch(() => {
        /* offline or expired token — no cached session to render */
      });

    return () => {
      mounted = false;
    };
  }, []);

  // 2) Live rows for this account. `userId` (not `profile`) is the dependency
  //    so refreshing the profile above cannot trigger a second fetch loop.
  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    setLoading(true);
    setError(null);

    api
      .orders()
      .then((res) => {
        if (mounted) setOrders(res.orders ?? []);
      })
      .catch((err) => {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Could not load your trade records.');
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    if (role === 'supplier') {
      api
        .products()
        .then((res) => {
          if (mounted) {
            setProducts(
              (res.products ?? []).filter((p) => String(p.supplierId) === String(userId))
            );
          }
        })
        .catch(() => {
          /* catalogue is secondary — never hide the rest of the profile */
        });
    }

    return () => {
      mounted = false;
    };
  }, [userId, role]);

  if (!profile) {
    return <Loader />;
  }

  const businessName = profile.businessName || profile.name;
  // Clickable map for the trader's own profile — GPS point, or a maps search
  // on the written location when no coordinates were captured.
  const locationMapsUrl = googleMapsUrl(profile);
  const isSupplier = role === 'supplier';

  const settledOrders = orders.filter((o) => o.status !== 'Cancelled');
  const totalSpent = settledOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const pendingOrders = orders.filter((o) => o.status === 'Pending' || o.status === 'Confirmed').length;
  const activeListings = products.filter((p) => p.status === 'Active').length;
  const averageRating = products.length
    ? products.reduce((sum, p) => sum + (p.rating || 0), 0) / products.length
    : 0;

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-asan-dark dark:text-white tracking-tight">
            Business Profile
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {ROLE_LABEL[role]} account • verified credentials and trade summary
          </p>
        </div>

        <Link
          href={`/${role}/settings`}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-asan-accent hover:bg-asan-accent-hover text-white text-xs font-bold shadow-md shadow-emerald-700/20 transition self-start sm:self-auto"
        >
          <Pencil className="w-3.5 h-3.5" />
          <span>Edit in Settings</span>
        </Link>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-700 dark:text-red-300">
          ⚠️ {error}
        </div>
      )}
      {/* Identity card */}
      <div className="p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 min-w-0">
            {profile.avatar ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={profile.avatar}
                alt={businessName}
                className="w-20 h-20 rounded-2xl object-cover border-2 border-emerald-500 shrink-0"
              />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-asan-dark text-white flex items-center justify-center text-2xl font-extrabold border-2 border-emerald-500 shrink-0">
                {businessName.charAt(0).toUpperCase()}
              </div>
            )}

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white truncate">
                  {businessName}
                </h2>
                {profile.verified ? (
                  <Badge variant="verified">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Verified
                  </Badge>
                ) : (
                  <Badge variant="pending">
                    <Clock className="w-3.5 h-3.5" />
                    KYC pending
                  </Badge>
                )}
              </div>

              <p className="text-xs text-slate-500 mt-1">
                Owner: {profile.name}
                {profile.category ? ` • ${profile.category}` : ''}
              </p>

              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-600 dark:text-slate-300">
                {profile.city && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    {profile.city}, Pakistan
                  </span>
                )}
                {profile.houseAddress && (
                  <span className="flex items-start gap-1 min-w-0" title="House address">
                    <Home className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                    <span className="break-words">{profile.houseAddress}</span>
                  </span>
                )}
                {profile.currentHouseLocation && (
                  <span className="flex items-center gap-1 min-w-0" title="Current house location">
                    <Navigation className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    {locationMapsUrl ? (
                      <a
                        href={locationMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-words hover:text-emerald-600 hover:underline"
                        title={
                          profile.currentLocation
                            ? `Captured GPS: ${profile.currentLocation.lat}, ${profile.currentLocation.lng}`
                            : undefined
                        }
                      >
                        {profile.currentHouseLocation}
                      </a>
                    ) : (
                      <span className="break-words">{profile.currentHouseLocation}</span>
                    )}
                  </span>
                )}
                {profile.ntn && (
                  <span className="font-mono text-emerald-600 font-bold">NTN: {profile.ntn}</span>
                )}
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-center sm:text-right shrink-0">
            <p className="text-lg font-extrabold text-asan-dark dark:text-emerald-300 capitalize">
              {ROLE_LABEL[role]}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {isSupplier
                ? `${products.length} listing${products.length === 1 ? '' : 's'}`
                : `${orders.length} order${orders.length === 1 ? '' : 's'} placed`}
            </p>
          </div>
        </div>
      </div>

      {/* Contact & account details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3 min-w-0">
          <Mail className="w-5 h-5 text-asan-accent shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900 dark:text-white">Email</p>
            <p className="text-[11px] text-slate-400 truncate">{profile.email || '—'}</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3 min-w-0">
          <Phone className="w-5 h-5 text-asan-accent shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900 dark:text-white">Phone</p>
            <p className="text-[11px] text-slate-400 truncate">{profile.phone || '—'}</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3 min-w-0">
          <Building2 className="w-5 h-5 text-asan-accent shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900 dark:text-white">Account Type</p>
            <p className="text-[11px] text-slate-400 truncate">{ROLE_LABEL[role]}</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3 min-w-0">
          <ShieldCheck className="w-5 h-5 text-asan-accent shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900 dark:text-white">
              {profile.verified ? 'KYC Approved' : 'KYC Pending'}
            </p>
            <p className="text-[11px] text-slate-400 truncate">
              {profile.createdAt ? `Member since ${formatDate(profile.createdAt)}` : 'Escrow protected'}
            </p>
          </div>
        </div>
      </div>
      {/* Trade summary — derived from the same rows the portal tables render */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isSupplier ? (
          <>
            <StatsCard title="Total Revenue" value={formatPKR(totalSpent)} icon={CreditCard} />
            <StatsCard title="Active Listings" value={String(activeListings)} icon={Package} />
            <StatsCard title="Orders Received" value={String(orders.length)} icon={ShoppingCart} />
            <StatsCard
              title="Average Rating"
              value={averageRating ? `${averageRating.toFixed(1)} ★` : '—'}
              icon={Star}
            />
          </>
        ) : (
          <>
            <StatsCard title="Orders Placed" value={String(orders.length)} icon={ShoppingCart} />
            <StatsCard title="Total Spent" value={formatPKR(totalSpent)} icon={CreditCard} />
            <StatsCard title="Pending Orders" value={String(pendingOrders)} icon={Clock} />
            <StatsCard
              title="Delivered"
              value={String(orders.filter((o) => o.status === 'Delivered').length)}
              icon={Package}
            />
          </>
        )}
      </div>

      {isSupplier && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Active Wholesale Products from this Supplier
            </h3>
            <Link
              href="/supplier/my-products"
              className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              Manage listings →
            </Link>
          </div>

          {loading && products.length === 0 && (
            <div className="flex items-center justify-center py-10">
              <Loader />
            </div>
          )}

          {!loading && products.length === 0 && (
            <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
              <p className="text-sm text-slate-500">
                No listings yet. Add your first bulk lot to appear in the marketplace.
              </p>
            </div>
          )}

          {products.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
