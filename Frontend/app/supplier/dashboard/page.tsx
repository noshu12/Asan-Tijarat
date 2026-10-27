"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { PortalHeader } from '@/components/PortalHeader';
import { StatsCard } from '@/components/StatsCard';
import { OrderTable } from '@/components/OrderTable';
import { ProductImage } from '@/components/ProductImage';
import { DollarSign, Package, ShoppingCart, Clock, PlusCircle, Boxes } from 'lucide-react';
import { formatPKR } from '@/lib/utils';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthProvider';
import { Order, Product, User } from '@/lib/types';
import { Loader } from '@/components/ui/loader';

export default function SupplierDashboardPage() {
  // Live rows for this supplier. GET /api/orders + GET /api/products are
  // filtered by the JWT server-side, so these arrays only ever contain the
  // signed-in supplier's own records.
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

    api.orders()
      .then((ordersRes) => {
        if (!mounted) return;
        const mine = ordersRes.orders.filter((o: Order) => String(o.supplierId) === String(user.id));
        // Loose (string) comparison + server-list fallback: if the id shapes
        // ever diverge we still show the orders instead of an empty table.
        setOrders(mine.length > 0 ? mine : ordersRes.orders);
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    api.products()
      .then((productsRes) => {
        if (!mounted) return;
        setProducts(
          productsRes.products.filter((p: Product) => String(p.supplierId) === String(user.id))
        );
      })
      .catch(() => {
        /* listings are secondary — never hide the orders because of this */
      });

    return () => { mounted = false; };
  }, [user, refreshKey]);

  // KPI values are derived from the same rows the table below renders, so the
  // numbers can never drift from the order list (no more hardcoded 4.8M/342).
  const totalRevenue = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const pendingOrders = orders.filter((o) => o.status === 'pending').length;
  const activeListings = products.filter((p) => p.status === 'Active').length;
  const recentOrders = orders.slice(0, 3);

  if (!user) {
    return (
      <div className="flex items-center justify-center py-20">
        <svg className="animate-spin h-8 w-8 text-emerald-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
        </svg>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-asan-dark dark:text-white tracking-tight">
            Supplier Portal
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {user.businessName || user.name}
            {user.city ? ` • ${user.city}` : ''} • {orders.length} order
            {orders.length === 1 ? '' : 's'} received
          </p>
        </div>

        <Link
          href="/supplier/add-product"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-asan-accent hover:bg-asan-accent-hover text-white text-xs font-bold shadow-md shadow-emerald-700/20 transition self-start sm:self-auto"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Add New Product</span>
        </Link>
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

      {/* Quick KPI Stats — live values derived from the orders table below */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Total Revenue" value={formatPKR(totalRevenue)} icon={DollarSign} />
        <StatsCard title="Active Listings" value={String(activeListings)} icon={Package} />
        <StatsCard title="Total Orders" value={String(orders.length)} icon={ShoppingCart} />
        <StatsCard title="Pending Orders" value={String(pendingOrders)} icon={Clock} />
      </div>

      {/* ── My Listings ────────────────────────────────────────────────────
          Every row renders the photo the supplier uploaded in Add Product
          (the API returns it as `image` = /uploads/products/<file>), so the
          dashboard always shows the real product picture — never a stock
          placeholder. */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">My Listings</h3>
          <Link href="/supplier/my-products" className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline">
            Manage all →
          </Link>
        </div>

        {products.length === 0 ? (
          <div className="text-center py-10 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
            <Boxes className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No listings yet — add your first product to see it here.</p>
            <Link
              href="/supplier/add-product"
              className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-xl bg-asan-accent hover:bg-asan-accent-hover text-white text-xs font-bold shadow-md transition"
            >
              <PlusCircle className="w-4 h-4" /> Add New Product
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((p) => (
              <Link
                key={p.id}
                href="/supplier/my-products"
                className="flex items-center gap-3 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition"
              >
                <ProductImage
                  src={p.image}
                  alt={p.name}
                  className="w-16 h-16 rounded-xl object-cover shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{p.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {formatPKR(p.price)} / {p.unit} • {p.stock} in stock
                  </p>
                  <span
                    className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      p.status === 'Active'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        : p.status === 'Low Stock'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Recent Received Orders</h3>
          <Link href="/supplier/orders" className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline">
            Manage Orders
          </Link>
        </div>
        {loading && recentOrders.length === 0 && !error && (
          <div className="flex items-center justify-center py-16">
            <Loader />
          </div>
        )}
        {!loading && !error && recentOrders.length === 0 && (
          <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
            <p className="text-sm text-slate-500">
              No received orders yet. Orders placed by shopkeepers will appear here.
            </p>
          </div>
        )}
        {recentOrders.length > 0 && <OrderTable orders={recentOrders} />}
      </div>

    </div>
  );
}
