"use client";

import React, { useEffect, useState } from 'react';
import { PortalHeader } from '@/components/PortalHeader';
import { Loader } from '@/components/ui/loader';
import { Badge } from '@/components/ui/badge';
import { Search, ShieldCheck, Package } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthProvider';
import { Order, OrderStatus } from '@/lib/types';
import { formatPKR, formatDate } from '@/lib/utils';

const TABS: ('All' | OrderStatus)[] = ['All', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
const ORDER_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];

const statusLabel = (s: string) => (s === 'All' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1));

export default function AdminOrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<'All' | OrderStatus>('All');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // Wait for the auth provider to finish restoring the session from the httpOnly cookie.
    if (authLoading) return;

    let mounted = true;

    if (!user || user.role !== 'admin') {
      if (mounted) setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    api.admin
      .orders({ status: activeTab === 'All' ? undefined : activeTab, search: search.trim() || undefined })
      .then((res) => { if (mounted) setOrders(res.orders); })
      .catch((err) => { if (mounted) setError(err instanceof Error ? err.message : 'Failed to load orders.'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [user, activeTab]);

  const updateStatus = (o: Order, status: OrderStatus) => {
    setBusyId(o.id);
    setMessage(null);
    setError(null);
    api.admin
      .updateOrderStatus(o.id, status)
      .then((res) => {
        setMessage(`Order ${res.order.orderNumber} is now ${statusLabel(status)}.`);
        setOrders(orders.map((x) => (x.id === o.id ? res.order : x)));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Status update failed.'))
      .finally(() => setBusyId(null));
  };

  const getVariant = (s: OrderStatus) => {
    switch (s) {
      case 'delivered': return 'delivered';
      case 'shipped': return 'shipped';
      case 'confirmed': return 'confirmed';
      case 'pending': return 'pending';
      default: return 'outline';
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
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">Sign in with an admin account to manage platform orders.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PortalHeader
        title="All Orders"
        subtitle="Monitor every buyer↔supplier order on the platform"
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
            placeholder="Search order #, buyer or supplier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setActiveTab('All');
                setSearch((e.currentTarget as HTMLInputElement).value);
              }
            }}
            className="pl-9 pr-4 py-2 w-full rounded-xl border border-slate-200 bg-white text-xs dark:bg-slate-900 dark:border-slate-800 dark:text-white focus:outline-none focus:border-asan-accent transition"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === tab
                ? 'bg-asan-dark text-white shadow-md'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
            }`}
          >
            {statusLabel(tab)}
          </button>
        ))}
      </div>

      {loading ? (
        <Loader />
      ) : orders.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
          <Package className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No orders match the selected filter.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">Order #</th>
                <th className="px-4 py-3">Parties</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                  <td className="px-4 py-3 font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                    {o.orderNumber}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">{o.items[0]?.productName || '—'}</p>
                    <p className="text-[11px] text-slate-400">
                      Buyer: {o.buyerName} → Supplier: {o.supplierName}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs font-bold text-slate-900 dark:text-white">
                    {formatPKR(o.totalAmount)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <Badge variant={getVariant(o.status)}>{statusLabel(o.status)}</Badge>
                      <select
                        value={o.status}
                        disabled={busyId !== null}
                        onChange={(e) => updateStatus(o, e.target.value as OrderStatus)}
                        className="h-7 px-1.5 text-[11px] rounded-lg border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800 dark:text-white focus:outline-none"
                        title="Admin status override"
                      >
                        {ORDER_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
                      </select>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                    {formatDate(o.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
