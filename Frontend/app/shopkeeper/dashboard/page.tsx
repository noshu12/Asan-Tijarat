"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { PortalHeader } from '@/components/PortalHeader';
import { StatsCard } from '@/components/StatsCard';
import { OrderTable } from '@/components/OrderTable';
import { ShoppingCart, CreditCard, Clock, Sparkles, ArrowRight, Store, ShieldCheck } from 'lucide-react';
import { formatPKR } from '@/lib/utils';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthProvider';
import { Order, Product } from '@/lib/types';
import { Loader } from '@/components/ui/loader';
import { AIRecommendationCard } from '@/components/AIRecommendationCard';

export default function ShopkeeperDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<{ totalOrders: number; totalSpent: number; pendingOrders: number } | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [recommended, setRecommended] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    // Wait for the auth provider to finish restoring the session from the httpOnly cookie.
    if (authLoading) return;

    let mounted = true;

    if (!user) {
      if (mounted) setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // The backend already scopes GET /api/orders to the signed-in user
    // (buyerId for shopkeepers), so use the returned list as-is — no
    // client-side id filter that could hide real orders.
    api.orders()
      .then((ordersRes) => {
        if (!mounted) return;
        const myOrders = ordersRes.orders ?? [];
        setStats({
          totalOrders: myOrders.length,
          totalSpent: myOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0),
          pendingOrders: myOrders.filter((o) => o.status === 'Pending' || o.status === 'Confirmed').length,
        });
        setRecentOrders(myOrders.slice(0, 3));
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    // Recommendations are non-critical — their failure must not mask order errors.
    api.products({ category: user.role === 'shopkeeper' ? undefined : 'all' })
      .then((productsRes) => {
        if (mounted && productsRes) setRecommended(productsRes.products.slice(0, 3));
      })
      .catch(() => {});

    return () => { mounted = false; };
  }, [user, refreshKey]);

  if (loading) {
    return (
      <div className="space-y-8">
        <PortalHeader
          title="Dashboard"
          subtitle="Thursday, 3 July 2026 • Shopkeeper Portal"
        />
        <div className="flex items-center justify-center py-20">
          <Loader />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8">
        <ShieldCheck className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Please sign in</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          Sign in with a shopkeeper account to continue.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PortalHeader
        title="Dashboard"
        subtitle="Shopkeeper Portal"
      />

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-700 dark:text-red-300">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Welcome Banner matching Figma w4.png */}
      <div className="rounded-3xl bg-gradient-to-r from-asan-dark to-emerald-900 text-white p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div>
          <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            Welcome back, {user?.businessName || user?.name || 'Shopkeeper'} 👋
          </h2>
          <p className="text-xs sm:text-sm text-emerald-200/80 mt-1">
            Discover <strong className="text-white">12 new wholesale commodities</strong> matching your inventory preferences.
          </p>
        </div>

        <Link
          href="/marketplace"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-asan-accent hover:bg-asan-accent-hover text-white text-xs sm:text-sm font-bold shadow-lg transition shrink-0"
        >
          <Store className="w-4 h-4" />
          <span>Browse Marketplace</span>
        </Link>
      </div>

      {/* Quick KPI Stats — live counts from the same orders list rendered below */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatsCard
          title="Total Wholesale Orders"
          value={String(stats?.totalOrders ?? 0)}
          change="+5.2%"
          isPositive={true}
          icon={ShoppingCart}
        />
        <StatsCard
          title="Pending Orders"
          value={String(stats?.pendingOrders ?? 0)}
          change="+1.8%"
          isPositive={true}
          icon={Clock}
        />
        <StatsCard
          title="Total Spent"
          value={formatPKR(stats?.totalSpent ?? 0)}
          change="+11%"
          isPositive={true}
          icon={CreditCard}
        />
      </div>

      {/* AI Recommendations Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-asan-accent" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Recommended for You</h3>
            <span className="text-[11px] text-slate-400">Personalized AI picks • updated daily</span>
          </div>
          <Link href="/marketplace" className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1">
            <span>Browse all</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {recommended.map((product) => (
            <AIRecommendationCard key={product.id} product={product} />
          ))}
        </div>
      </div>

      {/* Recent Orders Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Recent Orders</h3>
          <Link href="/shopkeeper/orders" className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline">
            View all
          </Link>
        </div>
        <OrderTable orders={recentOrders} />
      </div>

    </div>
  );
}
