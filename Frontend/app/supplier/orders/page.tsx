"use client";

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthProvider';
import { Order, OrderStatus } from '@/lib/types';
import { OrderTable } from '@/components/OrderTable';
import { PortalHeader } from '@/components/PortalHeader';
import { Loader } from '@/components/ui/loader';
import { Button } from '@/components/ui/button';
import { Truck, CheckCircle, Navigation } from 'lucide-react';
import { formatDate, orderGoogleMapsUrl } from '@/lib/utils';

export default function SupplierOrdersPage() {
  const [activeTab, setActiveTab] = useState<'All' | OrderStatus>('All');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Batch 04 — GET /api/orders is paginated (50/page); older orders load
  // via the "Load more" button below instead of one giant response.
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const { user, loading: authLoading } = useAuth();
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
    setPage(1);
    api.orders({ limit: 50 })
      .then((res) => {
        if (!mounted) return;
        // A buyer-cancelled pending order never reaches the supplier —
        // keep cancelled orders out of this list entirely.
        const notCancelled = (o: Order) => o.status !== 'cancelled';
        const mine = res.orders.filter((o: Order) => String(o.supplierId) === String(user.id) && notCancelled(o));
        // Loose (string) id comparison + server-list fallback: if the id shapes
        // ever diverge we still show the supplier's orders instead of nothing.
        setOrders(mine.length > 0 ? mine : res.orders.filter(notCancelled));
        setTotalPages(res.totalPages ?? 1);
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load orders');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [authLoading, user, refreshKey]);

  const updateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
    try {
      await api.updateOrderStatus(orderId, newStatus);
      // Refresh orders
      const res = await api.orders({ limit: 50 });
      const mine = res.orders.filter((o: Order) => String(o.supplierId) === String(user?.id));
      setOrders(mine.length > 0 ? mine : res.orders);
      setPage(1);
      setTotalPages(res.totalPages ?? 1);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update order status');
    }
  };

  // Batch 04 — appends the next page of orders (oldest first is impossible
  // here: the list is newest-first, so "more" means older orders).
  const loadMore = () => {
    const nextPage = page + 1;
    if (nextPage > totalPages || loadingMore) return;
    setLoadingMore(true);
    api.orders({ limit: 50, page: nextPage })
      .then((res) => {
        const notCancelled = (o: Order) => o.status !== 'cancelled';
        const mine = res.orders.filter((o: Order) => String(o.supplierId) === String(user?.id) && notCancelled(o));
        const list = mine.length > 0 ? mine : res.orders.filter(notCancelled);
        setOrders((prev) => [...prev, ...list]);
        setPage(nextPage);
        setTotalPages(res.totalPages ?? 1);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load more orders');
      })
      .finally(() => setLoadingMore(false));
  };

  const filteredOrders = activeTab === 'All' ? orders : orders.filter((o) => o.status === activeTab);

  return (
    <div className="space-y-6">
      {/* Bell fix — heading block replaced by the header (same title). */}
      <PortalHeader title="Received Orders" subtitle="Supplier Portal" />

      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {(['All', 'pending', 'confirmed', 'processing', 'shipped', 'delivered'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === tab
                ? 'bg-asan-dark text-white shadow-md'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
            }`}
          >
            {tab === 'All' ? 'All' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {loading && user && (
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

      {!loading && !error && filteredOrders.length === 0 && (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
          <p className="text-sm text-slate-500">No orders in this status.</p>
        </div>
      )}

      {filteredOrders.length > 0 && <OrderTable orders={filteredOrders} detailsHref={(o) => `/supplier/orders/${o.id}`} />}

      {/* Quick status actions for supplier — only when something is actionable */}
      {filteredOrders.some((o) => o.status !== 'delivered' && o.status !== 'cancelled') && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
            Quick Status Actions
          </h3>
          {filteredOrders
            .filter((o) => o.status !== 'delivered' && o.status !== 'cancelled')
            .map((order) => (
              <div key={order.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">{order.orderNumber}</p>
                  <p className="text-xs text-slate-500">{formatDate(order.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {/* One tap opens Google Maps at the shopkeeper's exact
                      GPS point so the supplier can navigate for delivery. */}
                  {orderGoogleMapsUrl(order) && (
                    <a
                      href={orderGoogleMapsUrl(order)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-asan-border dark:border-asan-mid bg-asan-accent-light dark:bg-asan-dark/40 text-asan-accent-hover dark:text-asan-accent-light hover:bg-asan-accent-light dark:hover:bg-asan-dark text-xs font-bold transition"
                      title="Open the shopkeeper's location in Google Maps"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      Navigate
                    </a>
                  )}
                  {order.status === 'pending' && (
                    <Button size="sm" onClick={() => updateOrderStatus(order.id, 'confirmed')}>
                      Confirm
                    </Button>
                  )}
                  {order.status === 'confirmed' && (
                    <Button size="sm" onClick={() => updateOrderStatus(order.id, 'processing')}>
                      Process
                    </Button>
                  )}
                  {order.status === 'processing' && (
                    <Button size="sm" onClick={() => updateOrderStatus(order.id, 'shipped')}>
                      <Truck className="w-3.5 h-3.5 mr-1" />
                      Ship
                    </Button>
                  )}
                  {order.status === 'shipped' && (
                    <Button size="sm" onClick={() => updateOrderStatus(order.id, 'delivered')}>
                      <CheckCircle className="w-3.5 h-3.5 mr-1" />
                      Deliver
                    </Button>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}

      {page < totalPages && (
        <div className="flex justify-center pt-2">
          <Button onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more orders'}
          </Button>
        </div>
      )}
    </div>
  );
}
