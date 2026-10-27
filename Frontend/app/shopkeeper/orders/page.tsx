"use client";

import React, { useState, useEffect } from 'react';
import { PortalHeader } from '@/components/PortalHeader';
import { OrderTable } from '@/components/OrderTable';
import { Order, OrderStatus } from '@/lib/types';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthProvider';
import { Loader } from '@/components/ui/loader';

export default function ShopkeeperOrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'All' | OrderStatus>('All');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Current session user — useAuth() is called at the top of the component
  // only, never inside useEffect. This effect only READS user/authLoading.
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setMyId(null);
      setMyRole(null);
      setLoading(false);
      return;
    }

    setMyId(user.id);
    setMyRole(user.role);
  }, [authLoading, user]);

  // Fetch orders once we know who's logged in.
  // NOTE: `loading` must NOT be in the dependency array (it used to be) —
  // with it there, the `if (!myId || loading) return` guard above bailed out
  // while loading was still `true`, so the fetch never started and the page
  // stayed stuck on the spinner forever.
  useEffect(() => {
    if (!myId) return;
    let mounted = true;
    setLoading(true);
    setError(null);
    api.orders()
      .then((res) => {
        if (mounted) {
          // Support both shopkeeper (buyerId) and supplier (supplierId) views.
          const myOrders = res.orders.filter((o) =>
            myRole === 'shopkeeper'
              ? String(o.buyerId) === String(myId)
              : String(o.supplierId) === String(myId)
          );
          // GET /api/orders is already scoped to the signed-in user by the
          // backend, so if the local id shape doesn't line up (e.g. legacy
          // mock session) fall back to the server-filtered list instead of
          // silently showing an empty page.
          setOrders(myOrders.length > 0 ? myOrders : res.orders);
        }
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load orders');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [myId, myRole, refreshKey]);

  const filteredOrders = activeTab === 'All'
    ? orders
    : orders.filter((order) => order.status === activeTab);

  const isEmpty = !loading && orders.length === 0 && myId;

  return (
    <div className="space-y-6">
      <PortalHeader
        title="My Orders"
        subtitle="Thursday, 3 July 2026 • Shopkeeper Portal"
      />

      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {(['All', 'Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === tab
                ? 'bg-asan-dark text-white shadow-md'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {authLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader />
        </div>
      )}

      {loading && myId && (
        <div className="flex items-center justify-center py-16">
          <Loader />
        </div>
      )}

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

      {isEmpty && (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
          <p className="text-sm text-slate-500">No orders yet.</p>
          <p className="text-xs text-slate-400 mt-1">Browse the marketplace to add items to your cart.</p>
        </div>
      )}

      {!loading && !error && myId !== null && filteredOrders.length === 0 && !isEmpty && (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
          <p className="text-sm text-slate-500">No orders match the selected filter.</p>
        </div>
      )}

      {filteredOrders.length > 0 && <OrderTable orders={filteredOrders} />}
    </div>
  );
}
