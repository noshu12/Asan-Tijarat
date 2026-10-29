"use client";

import React, { useState, useEffect } from 'react';
import { StatsCard } from '@/components/StatsCard';
import { CreditCard, ShoppingCart, Clock, TrendingUp, Store } from 'lucide-react';
import { formatPKR } from '@/lib/utils';
import { api, ShopkeeperAnalytics } from '@/lib/api';
import { useAuth } from '@/context/AuthProvider';
import { Loader } from '@/components/ui/loader';

const STATUS_ORDER = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];

function prettyStatus(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function ShopkeeperAnalyticsPage() {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<ShopkeeperAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    let mounted = true;
    if (!user) {
      if (mounted) setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    api.shopkeeperAnalytics()
      .then((res) => { if (mounted) setData(res); })
      .catch((err) => { if (mounted) setError(err instanceof Error ? err.message : 'Failed to load analytics'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [user, authLoading, refreshKey]);

  const maxDaily = Math.max(0, ...(data?.dailySpent.map((d) => d.revenue) ?? [0]));
  const pendingCount = (data?.ordersByStatus.pending ?? 0) + (data?.ordersByStatus.confirmed ?? 0);

  return (
    <div className="space-y-8">
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-2xl sm:text-3xl font-bold text-asan-dark dark:text-white tracking-tight">
          Analytics
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Your spending and supplier summary from real orders.
        </p>
      </div>

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

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader />
        </div>
      ) : !data || data.totalOrders === 0 ? (
        <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm text-center">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            No analytics yet
          </h3>
          <p className="text-xs text-slate-500 mt-2">
            No orders or spending data to show yet. Once real orders are placed, your analytics will appear here automatically.
          </p>
        </div>
      ) : (
        <>
          {/* KPI cards — real totals, cancelled orders excluded */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard title="Total Spent" value={formatPKR(data.spentTotal)} icon={CreditCard} />
            <StatsCard title="Delivered Spend" value={formatPKR(data.spentDelivered)} icon={TrendingUp} />
            <StatsCard title="Total Orders" value={String(data.totalOrders)} icon={ShoppingCart} />
            <StatsCard title="Pending / Confirmed" value={String(pendingCount)} icon={Clock} />
          </div>

          {/* Orders by status */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Orders by Status</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {STATUS_ORDER.map((s) => (
                <div
                  key={s}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center"
                >
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {data.ordersByStatus[s] ?? 0}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">{prettyStatus(s)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Top suppliers */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Top Suppliers by Spend</h3>
            {data.topSuppliers.length === 0 ? (
              <p className="text-xs text-slate-500">No completed orders yet.</p>
            ) : (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-200 dark:border-slate-800">
                      <th className="px-4 py-3 font-bold">Supplier</th>
                      <th className="px-4 py-3 font-bold text-right">Orders</th>
                      <th className="px-4 py-3 font-bold text-right">Spent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topSuppliers.map((s) => (
                      <tr key={s.supplierId} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                          <Store className="w-4 h-4 text-slate-400 shrink-0" />
                          <span className="truncate">{s.supplierName}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{s.orders}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">{formatPKR(s.spent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Last 14 days spend */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Spending — Last 14 Days</h3>
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
              {data.dailySpent.map((d) => (
                <div key={d.date} className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 w-14 shrink-0">{d.date.slice(5)}</span>
                  <div className="flex-1 h-4 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-4 rounded bg-emerald-500"
                      style={{ width: `${maxDaily > 0 ? (d.revenue / maxDaily) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 w-24 text-right shrink-0">
                    {formatPKR(d.revenue)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
