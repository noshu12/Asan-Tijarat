"use client";

import React, { useEffect, useRef, useState } from 'react';
import { PortalHeader } from '@/components/PortalHeader';
import { Loader } from '@/components/ui/loader';
import { Badge } from '@/components/ui/badge';
import { Search, ShieldCheck, Package } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthProvider';
import { Order, OrderStatus, PAYMENT_METHOD_LABEL } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { formatPKR, formatDate, capitalize } from '@/lib/utils';
import { idFromEventLink, ORDER_EVENT_TYPES, PAYMENT_EVENT_TYPES, useLiveRefreshKey, useRealtimeEvent } from '@/hooks/useRealtime';

const TABS: ('All' | OrderStatus)[] = ['All', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];

// Batch 22 (Round-5 audit h-L3) — the old local statusLabel one-liner
// is now the shared capitalize() from lib/utils; only the 'All' tab
// guard stays here.
const statusLabel = (s: string) => (s === 'All' ? 'All' : capitalize(s));

export default function AdminOrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<'All' | OrderStatus>('All');
  // Batch 19 (Round-5 audit H2) — the table paginates (50/page) instead
  // of only ever showing the first 500 orders.
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  // FIX (Batch 03) — search typing refetch nahi karta tha: fetch effect ki
  // deps me `search` tha hi nahi. Ab search 400ms debounce hoke
  // `debouncedSearch` me jata hai, aur fetch effect usi pe chalta hai.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Admin confirms a submitted payment (Batch 05 endpoint, the UI button
  // was missing): refreshKey refetches the list after a confirm, busyId
  // tracks the row being confirmed, notice shows the result.
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Batch 13 — live list: a matching event (or a reconnect sync) bumps
  // refreshKey; the fetch effect below refetches silently on a bump, so
  // the table, scroll, search text and tabs never reset.
  // Batch 24 — order events NO LONGER bump refreshKey: order_placed
  // prepends the one new row and order_status / lifecycle events update
  // the one row in place (handler below), so the table is never fully
  // refetched for an order event. Payment + dispute events and the
  // reconnect sync still refetch silently via refreshKey.
  const prevRefreshKeyRef = useRef(refreshKey);
  useLiveRefreshKey(
    [...PAYMENT_EVENT_TYPES, 'dispute_opened', 'dispute_resolved'],
    () => setRefreshKey((k) => k + 1),
  );
  const ordersRef = useRef<Order[]>([]);
  ordersRef.current = orders;
  // Batch 24 hardening — in-flight prepend guard (same race as the
  // marketplace page: Batch 23 sends order_placed twice to admins,
  // targeted + public). The second frame returns before fetching.
  const pendingOrderPrependRef = useRef(new Set<string>());
  const totalRef = useRef(total);
  totalRef.current = total;

  // Batch 24 — row-wise order updates (Batch 23 added `order_status`).
  // VERIFIED: order_placed WAS wired before Batch 24, but only as a
  // full silent list refetch via useLiveRefreshKey. Now: on
  // order_placed, GET that ONE order (existing api.order) and prepend
  // the row; on order_status / confirmed / shipped / delivered /
  // cancelled, GET the one order and replace its row in place — or
  // drop the row when its new status no longer matches the open tab
  // (it still exists; switching tabs refetches that tab). Rows are
  // only prepended on page 1 and only when they match the open tab +
  // search. A failed single fetch is live-only noise.
  useRealtimeEvent(ORDER_EVENT_TYPES, (event) => {
    const orderId = event.orderId ?? idFromEventLink(event.link, 'orders');
    if (!orderId) return;
    const matchesView = (o: Order): boolean => {
      if (activeTab !== 'All' && o.status !== activeTab) return false;
      const q = debouncedSearch.trim().toLowerCase();
      if (q) {
        const hay = `${o.orderNumber} ${o.buyerName} ${o.supplierName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    };
    if (event.type === 'order_placed') {
      if (ordersRef.current.some((o) => o.id === orderId)) return;
      if (pendingOrderPrependRef.current.has(orderId)) return;
      pendingOrderPrependRef.current.add(orderId);
      void api.order(orderId).then((res) => {
        const o = res.order;
        if (!o) return;
        if (ordersRef.current.some((x) => x.id === o.id)) return;
        if (!matchesView(o)) return;
        const newTotal = totalRef.current + 1;
        setTotal(newTotal);
        setTotalPages((prev) => Math.max(prev, Math.ceil(newTotal / 50)));
        if (page !== 1) return;
        setOrders((prev) => [o, ...prev]);
      }).catch(() => {}).finally(() => {
        pendingOrderPrependRef.current.delete(orderId);
      });
      return;
    }
    if (!ordersRef.current.some((o) => o.id === orderId)) return;
    void api.order(orderId).then((res) => {
      const o = res.order;
      if (!o) return;
      if (matchesView(o)) {
        setOrders((prev) => prev.map((x) => (x.id === o.id ? o : x)));
      } else {
        setOrders((prev) => prev.filter((x) => x.id !== o.id));
        setTotal((prev) => Math.max(0, prev - 1));
      }
    }).catch(() => {});
  });

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => window.clearTimeout(t);
  }, [search]);


  useEffect(() => {
    // Wait for the auth provider to finish restoring the session from the httpOnly cookie.
    if (authLoading) return;

    // Batch 13 — silent on a live refreshKey bump (see above).
    const silent = prevRefreshKeyRef.current !== refreshKey;
    prevRefreshKeyRef.current = refreshKey;

    let mounted = true;

    if (!user || (user.role !== 'admin' && user.role !== 'subadmin')) {
      if (mounted) setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
    setError(null);
    api.admin
      .orders({ status: activeTab === 'All' ? undefined : activeTab, search: debouncedSearch || undefined, page, limit: 50 })
      .then((res) => {
        if (!mounted) return;
        setOrders(res.orders);
        setTotalPages(res.totalPages ?? 1);
        setTotal(res.total ?? res.orders?.length ?? 0);
        // The backend clamps out-of-range pages (safePage): sync the UI
        // to the page it actually served.
        if (res.page !== undefined && res.page !== page) setPage(res.page);
      })
      .catch((err) => { if (mounted) setError(err instanceof Error ? err.message : 'Failed to load orders.'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
    // FIX (Batch 03) — deps me debouncedSearch add kiya, taake typing se
    // refetch ho. Pehle deps sirf [user, activeTab] thay.
    // Batch 19 — `page` bhi dep hai (Prev/Next refetch karta hai).
  }, [user, activeTab, debouncedSearch, refreshKey, authLoading, page]);

  const getVariant = (s: OrderStatus) => {
    switch (s) {
      case 'delivered': return 'delivered';
      case 'shipped': return 'shipped';
      case 'confirmed': return 'confirmed';
      case 'pending': return 'pending';
      default: return 'outline';
    }
  };

  // Payment column: what the admin needs to verify before confirming —
  // the submitted reference + channel, or the settled fee/payout.
  const paymentCell = (o: Order) => {
    const status = o.paymentStatus ?? 'unpaid';
    switch (status) {
      case 'payment_submitted':
        return (
          <>
            <p className="text-xs font-bold text-amber-600 dark:text-amber-400">Payment submitted</p>
            <p className="text-xs text-slate-400 whitespace-nowrap">
              Ref: {o.paymentReference || '—'} · {o.paymentChannel || '—'}
            </p>
          </>
        );
      case 'held_in_escrow':
        return (
          <>
            <p className="text-xs font-bold text-slate-900 dark:text-white">Held in escrow</p>
            <p className="text-xs text-slate-400 whitespace-nowrap">{formatPKR(o.amountHeld ?? o.totalAmount)} held</p>
          </>
        );
      case 'paid':
        return (
          <>
            <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Paid</p>
            {o.platformFee != null && (
              <p className="text-xs text-slate-400 whitespace-nowrap">
                Fee {formatPKR(o.platformFee)} · Payout {formatPKR(o.payoutAmount ?? 0)}
              </p>
            )}
          </>
        );
      case 'released':
        return (
          <>
            <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Released to supplier</p>
            {o.platformFee != null && (
              <p className="text-xs text-slate-400 whitespace-nowrap">
                Fee {formatPKR(o.platformFee)} · Payout {formatPKR(o.payoutAmount ?? 0)}
              </p>
            )}
          </>
        );
      case 'frozen_dispute':
        return (
          <>
            <p className="text-xs font-bold text-red-600 dark:text-red-400">Frozen — dispute open</p>
            <p className="text-xs text-slate-400">Decide the dispute first</p>
          </>
        );
      case 'refunded':
        return (
          <>
            <p className="text-xs font-bold text-slate-900 dark:text-white">Refunded</p>
            {o.refundAmount != null && o.refundAmount > 0 ? (
              <p className="text-xs text-slate-400 whitespace-nowrap">{formatPKR(o.refundAmount)} returned</p>
            ) : (
              <p className="text-xs text-slate-400">No payment was made — nothing to refund</p>
            )}
          </>
        );
      default:
        return <p className="text-xs text-slate-400">Unpaid</p>;
    }
  };

  // Confirm a submitted payment (POST /api/admin/orders/:id/confirm-payment).
  // The button shows only for payment_submitted orders: a dispute filing
  // freezes the payment to frozen_dispute, so a submitted payment never has
  // an open dispute — and the backend is the final authority anyway (it
  // refuses DISPUTE_OPEN / INVALID_STATE, and that message is shown here,
  // not a generic alert).
  //   online_advance     → held in escrow (fee deducted at delivery).
  //   online_at_delivery → fee deducted now, rest marked paid to supplier.
  const confirmOrderPayment = async (o: Order) => {
    const methodLabel = o.paymentMethod ? PAYMENT_METHOD_LABEL[o.paymentMethod] : '—';
    const outcome =
      o.paymentMethod === 'online_at_delivery'
        ? 'The platform fee will be deducted and the rest will be marked as paid to the supplier.'
        : 'The money will be held in escrow until the shopkeeper confirms delivery.';
    const ok = window.confirm(
      `Confirm payment for ${o.orderNumber}?\n\nAmount: ${formatPKR(o.totalAmount)}\nMethod: ${methodLabel}\nReference: ${o.paymentReference || '—'} (${o.paymentChannel || '—'})\n\n${outcome}`
    );
    if (!ok) return;
    setError(null);
    setNotice(null);
    setBusyId(o.id);
    try {
      const res = await api.admin.confirmPayment(o.id);
      const updated = res.order;
      setNotice(
        updated.paymentStatus === 'paid'
          ? `Payment confirmed for ${updated.orderNumber} — fee ${formatPKR(updated.platformFee ?? 0)}, supplier payout ${formatPKR(updated.payoutAmount ?? 0)}.`
          : `Payment confirmed for ${updated.orderNumber} — ${formatPKR(updated.amountHeld ?? updated.totalAmount)} held in escrow.`
      );
      setRefreshKey((k) => k + 1);
    } catch (err) {
      // ApiError carries the server's own message (e.g. the dispute-open
      // refusal) — show it as-is instead of a generic alert.
      setError(err instanceof Error ? err.message : 'Failed to confirm payment.');
    } finally {
      setBusyId(null);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader />
      </div>
    );
  }

  if (!user || (user.role !== 'admin' && user.role !== 'subadmin')) {
    return (
      <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8">
        <ShieldCheck className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Admins only</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">Sign in with an admin or sub-admin account to manage platform orders.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PortalHeader
        title="All Orders"
        subtitle="Monitor every buyer↔supplier order on the platform"
      />

      {error && (
        <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300">
          ⚠️ {error}
        </div>
      )}

      {notice && (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          <span>✅ {notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="font-bold leading-none" aria-label="Dismiss">
            ×
          </button>
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
              // FIX (Batch 03) — Enter dabane se pehle activeTab 'All' pe reset
              // ho jata tha, is liye search + status filter ek saath kabhi
              // nahi chalte thay. Ab Enter sirf debounce ko foran flush karta
              // hai (turant search), tab jaisa hai waisa hi rehta hai.
              if (e.key === 'Enter') {
                setDebouncedSearch(search.trim());
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
            onClick={() => { setPage(1); setActiveTab(tab); }}
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
          <table className="min-w-[880px] w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">Order #</th>
                <th className="px-4 py-3">Parties</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                  <td className="px-4 py-3 font-mono font-bold text-xs text-asan-accent dark:text-asan-accent-light whitespace-nowrap">
                    {o.orderNumber}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">{o.items[0]?.productName || '—'}</p>
                    <p className="text-xs text-slate-400">
                      Buyer: {o.buyerName} → Supplier: {o.supplierName}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs font-bold text-slate-900 dark:text-white whitespace-nowrap">
                    {formatPKR(o.totalAmount)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={getVariant(o.status)}>{statusLabel(o.status)}</Badge>
                  </td>
                  <td className="px-4 py-3">{paymentCell(o)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {formatDate(o.createdAt)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {o.paymentStatus === 'payment_submitted' ? (
                      <Button
                        size="sm"
                        isLoading={busyId === o.id}
                        disabled={busyId !== null}
                        onClick={() => confirmOrderPayment(o)}
                      >
                        Confirm Payment
                      </Button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Batch 19 (audit H2) — page through orders instead of only ever
          seeing the first 500. */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 pt-2">
          <p className="text-xs text-slate-500">
            Page {page} of {totalPages} • {total} order{total === 1 ? '' : 's'}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </Button>
            <Button type="button" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
