"use client";

// GROUP3-ADMIN-FIX 2026-11-28
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { PortalHeader } from '@/components/PortalHeader';
import { StatsCard } from '@/components/StatsCard';
import { OrderTable } from '@/components/OrderTable';
import { Loader } from '@/components/ui/loader';
import { ProductImage } from '@/components/ProductImage';
import { ShieldCheck, Boxes } from 'lucide-react';
import { api, AdminStats } from '@/lib/api';
import { useAuth } from '@/context/AuthProvider';
import { Order, Product } from '@/lib/types';
import { cn, formatPKR, formatDate } from '@/lib/utils';
import { ACCOUNT_EVENT_TYPES, idFromEventLink, ORDER_EVENT_TYPES, PAYMENT_EVENT_TYPES, PRODUCT_EVENT_TYPES, useLiveRefreshKey, useRealtimeEvent } from '@/hooks/useRealtime';

type DailyPoint = { date: string; revenue: number; fee: number; orders: number };

// Dependency-free SVG line/area chart for the Trade Volume hero card.
// Light theme, Nectar green (#53B175) line + pale area fill, subtle
// gridlines + sparse date labels. Per-point values on hover via <title>.
// A day with no revenue plots at 0; an all-zero period is a flat line
// at the baseline (the parent adds the "No sales" note).
function TradeVolumeChart({ points }: { points: DailyPoint[] }) {
  const W = 600;
  // H 120 + flex-fill: chart card ki khaali jagah bharta hai (svg
  // h-full + preserveAspectRatio none, sirf lg+ par; mobile par
  // natural height). Row ki height side column se chalti hai, is liye
  // bottom row nahi hilti.
  const H = 120;
  const PAD = { l: 62, r: 8, t: 8, b: 18 };
  const n = points.length;
  const max = Math.max(0, ...points.map((p) => p.revenue));
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const x = (i: number) => (n <= 1 ? PAD.l + plotW / 2 : PAD.l + (i * plotW) / (n - 1));
  const y = (v: number) => (max === 0 ? PAD.t + plotH : PAD.t + (1 - v / max) * plotH);
  const ticks = [...new Set([0, 1 / 3, 2 / 3, 1].map((f) => Math.round(max * f)))];
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.revenue).toFixed(1)}`).join(' ');
  const areaPath = n > 0
    ? `${linePath} L${x(n - 1).toFixed(1)},${(PAD.t + plotH).toFixed(1)} L${x(0).toFixed(1)},${(PAD.t + plotH).toFixed(1)} Z`
    : '';
  // Chhota period (7d = 7 points) ho to har din ka label dikhao — peak
  // wale din (24 Nov) ka label ghayab nahi hona chahiye. Bare period
  // (30d/90d) mein 5 sparse labels hi kaafi hain.
  const labelIdx = n <= 10
    ? points.map((_, i) => i)
    : [...new Set([0, Math.floor((n - 1) / 4), Math.floor((n - 1) / 2), Math.floor((3 * (n - 1)) / 4), n - 1])]
        .filter((i) => i >= 0 && i < n);
  const shortDate = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto lg:h-full" preserveAspectRatio="none" role="img" aria-label="Daily revenue chart">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth="1" />
          <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#94a3b8">
            {formatPKR(t)}
          </text>
        </g>
      ))}
      {areaPath && <path d={areaPath} fill="#53B175" opacity="0.12" />}
      {linePath && (
        <path d={linePath} fill="none" stroke="#53B175" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      )}
      {n <= 31 && points.map((p, i) => (
        <circle key={p.date} cx={x(i)} cy={y(p.revenue)} r="3" fill="#ffffff" stroke="#53B175" strokeWidth="2" />
      ))}
      {points.map((p, i) => (
        <circle key={`hit-${p.date}`} cx={x(i)} cy={y(p.revenue)} r="12" fill="transparent">
          <title>{`${shortDate(p.date)} — ${formatPKR(p.revenue)} • ${p.orders} order${p.orders === 1 ? '' : 's'}`}</title>
        </circle>
      ))}
      {labelIdx.map((i) => (
        <text
          key={`x-${points[i].date}`}
          x={x(i)}
          y={H - 5}
          textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
          fontSize="10"
          fill="#94a3b8"
        >
          {shortDate(points[i].date)}
        </text>
      ))}
    </svg>
  );
}

// Month-over-month change for a count card. Never invents numbers:
// prev undefined (old backend) or both 0 → null, so the line hides.
// prev 0 + cur > 0 → "+N this month" count, never a fake % / Infinity.
function momChange(cur: number | undefined, prev: number | undefined): { change: string; changeSuffix: string; isPositive: boolean } | null {
  if (typeof cur !== 'number' || typeof prev !== 'number') return null;
  if (prev === 0) {
    if (cur <= 0) return null;
    return { change: `+${cur} this month`, changeSuffix: '', isPositive: true };
  }
  const pct = ((cur - prev) / prev) * 100;
  return { change: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`, changeSuffix: 'vs last month', isPositive: pct >= 0 };
}

export default function AdminDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  // Newest listings — rendered with the photo the supplier uploaded.
  const [recentProducts, setRecentProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Trade Volume chart — daily revenue from /api/admin/trade-volume.
  // Fetches on mount and whenever the 7d / 30d / 90d toggle changes.
  // A failed fetch never clears the hero total; it only shows a quiet
  // note under the chart area.
  const [tradeRange, setTradeRange] = useState<7 | 30 | 90>(7);
  const [tradePoints, setTradePoints] = useState<DailyPoint[] | null>(null);
  const [prevTotal, setPrevTotal] = useState<number | null>(null);
  // Previous-period fee total, for the "Aapki kamai" vs-previous pill.
  const [prevFeeTotal, setPrevFeeTotal] = useState<number | null>(null);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [tradeError, setTradeError] = useState(false);
  // Batch 13 — live stats + counts: an account / dispute event (or a
  // reconnect sync) bumps refreshKey; the fetch effect below refetches
  // silently on a bump, so the stats stay visible and nothing on the
  // page resets.
  // Batch 24 — order / payment / product events NO LONGER bump
  // refreshKey: they refetch stats ONLY (handler below), so the
  // Latest Listings grid is never reloaded for an order event.
  const [refreshKey, setRefreshKey] = useState(0);
  const prevRefreshKeyRef = useRef(refreshKey);
  useLiveRefreshKey(
    [...ACCOUNT_EVENT_TYPES, 'dispute_opened', 'dispute_resolved'],
    () => setRefreshKey((k) => k + 1),
  );
  const recentProductsRef = useRef<Product[]>([]);
  recentProductsRef.current = recentProducts;
  // Batch 24 hardening — in-flight prepend guards (same race as the
  // marketplace page: Batch 23 sends catalogue events twice to admins,
  // targeted + public). The second frame for the same id returns
  // before fetching. The id-exists checks stay as well.
  const pendingProductPrependRef = useRef(new Set<string>());

  // Batch 24 — stats-only live refetch. Order events (order_placed,
  // order_status + the four lifecycle events), payment events and
  // product events refetch ONLY api.admin.stats() — the Total Orders /
  // Trade Volume / Products Listed cards and the Recent Orders table —
  // never the whole page. AdminStats carries total orders only, not
  // per-status counts; pending / delivered surface through the Recent
  // Orders table, which this refetch also refreshes. A failed live
  // refetch never clears the cards. product_created additionally
  // prepends the one new listing to Latest Listings.
  const refreshStatsOnly = async () => {
    if (user?.role !== 'admin') return;
    try {
      const res = await api.admin.stats();
      setStats(res.stats);
      setRecentOrders(res.recentOrders);
    } catch {
      // Live-only: keep the last good stats on screen.
    }
  };
  useRealtimeEvent(
    [...ORDER_EVENT_TYPES, ...PAYMENT_EVENT_TYPES, ...PRODUCT_EVENT_TYPES],
    (event) => {
      void refreshStatsOnly();
      if (event.type === 'product_created') {
        const productId = idFromEventLink(event.link, 'product');
        if (!productId) return;
        if (recentProductsRef.current.some((p) => p.id === productId)) return;
        if (pendingProductPrependRef.current.has(productId)) return;
        pendingProductPrependRef.current.add(productId);
        void api.product(productId).then((data) => {
          const p = data.product;
          if (!p) return;
          setRecentProducts((prev) => [p, ...prev.filter((x) => x.id !== p.id)].slice(0, 6));
        }).catch(() => {}).finally(() => {
          pendingProductPrependRef.current.delete(productId);
        });
      }
    },
  );

  // GROUP3 — a new registration / KYC submission only needs a silent
  // stats refetch: the Pending Verification count on the card below
  // comes from stats, and the registrations themselves are reviewed
  // on the Users & KYC page (the card links there). The dashboard no
  // longer keeps its own pending-users list.
  useRealtimeEvent(['user_registered', 'kyc_submitted'], () => {
    if (user?.role !== 'admin') return;
    void refreshStatsOnly();
  });

  useEffect(() => {
    // Wait for the auth provider to finish restoring the session from the httpOnly cookie.
    if (authLoading) return;

    // Batch 13 — silent on a live refreshKey bump (see above).
    const silent = prevRefreshKeyRef.current !== refreshKey;
    prevRefreshKeyRef.current = refreshKey;

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

    if (!silent) setLoading(true);
    setError(null);

    Promise.allSettled([
      api.admin.stats(),
      api.admin.products({}),
    ]).then((results) => {
      if (!mounted) return;

      const [statsRes, productsRes] = results;

      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value.stats);
        setRecentOrders(statsRes.value.recentOrders);
      } else {
        setError(statsRes.reason instanceof Error ? statsRes.reason.message : 'Failed to load platform stats.');
      }

      if (productsRes.status === 'fulfilled') {
        setRecentProducts(productsRes.value.products.slice(0, 6));
      }

      if (mounted) setLoading(false);
    }).catch(() => {
      if (mounted) setLoading(false);
    });

    return () => { mounted = false; };
  }, [authLoading, user, refreshKey]);

  // Trade Volume chart fetch (see state above). Not wired into the
  // Batch 24 refreshStatsOnly live path on purpose — the live handler
  // would capture a stale range value; mount + toggle refetch is enough.
  useEffect(() => {
    if (authLoading || !user || user.role !== 'admin') return;
    let mounted = true;
    setTradeLoading(true);
    setTradeError(false);
    api.admin.tradeVolume(tradeRange)
      .then((res) => {
        if (!mounted) return;
        setTradePoints(res.points ?? []);
        setPrevTotal(typeof res.prevTotal === 'number' ? res.prevTotal : null);
        setPrevFeeTotal(typeof res.prevFeeTotal === 'number' ? res.prevFeeTotal : null);
      })
      .catch(() => { if (mounted) setTradeError(true); })
      .finally(() => { if (mounted) setTradeLoading(false); });
    return () => { mounted = false; };
  }, [authLoading, user, tradeRange]);

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
          href="/signin"
          className="inline-flex items-center gap-2 mt-5 px-5 py-2.5 rounded-xl bg-asan-accent hover:bg-asan-accent-hover text-white text-xs font-bold shadow-md transition"
        >
          Admin Sign In
        </Link>
      </div>
    );
  }

  // Vs-previous-period change for the Trade Volume hero card: the
  // current period total comes from the chart points, prevTotal from
  // the endpoint. prevTotal 0 → "No previous data", never Infinity/NaN.
  const currentTotal = tradePoints ? tradePoints.reduce((sum, p) => sum + p.revenue, 0) : null;
  let volumeChange: string | undefined;
  let volumePositive = true;
  if (currentTotal !== null && prevTotal !== null) {
    if (prevTotal === 0) {
      if (currentTotal > 0) volumeChange = 'No previous data';
    } else {
      const pct = ((currentTotal - prevTotal) / prevTotal) * 100;
      volumeChange = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
      volumePositive = pct >= 0;
    }
  }
  const volumeSuffix = volumeChange && volumeChange !== 'No previous data'
    ? `vs previous ${tradeRange} days`
    : '';

  // "Aapki kamai" — the 2% platform fee earned in the SELECTED range:
  // exact sum of the per-day `fee` points, so it moves with the 7d /
  // 30d / 90d toggle exactly like the range total. Loading fallback
  // only: all-time stats.feeTotal until the range points arrive.
  const currentFeeTotal = tradePoints ? tradePoints.reduce((sum, p) => sum + (p.fee ?? 0), 0) : null;
  const feeShown = currentFeeTotal ?? stats?.feeTotal ?? null;
  let feeChange: string | undefined;
  let feePositive = true;
  let feeSuffix = '';
  if (currentFeeTotal !== null && prevFeeTotal !== null) {
    if (prevFeeTotal === 0) {
      if (currentFeeTotal > 0) feeChange = 'No previous data';
    } else {
      const pct = ((currentFeeTotal - prevFeeTotal) / prevFeeTotal) * 100;
      feeChange = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
      feePositive = pct >= 0;
      feeSuffix = `vs previous ${tradeRange} days`;
    }
  }

  // Count-card month-over-month lines (real stats only; a missing field
  // hides that card's line quietly).
  const usersChange = momChange(stats?.joinedThisMonth?.users, stats?.joinedLastMonth?.users);
  const suppliersChange = momChange(stats?.joinedThisMonth?.suppliers, stats?.joinedLastMonth?.suppliers);
  const shopkeepersChange = momChange(stats?.joinedThisMonth?.shopkeepers, stats?.joinedLastMonth?.shopkeepers);
  const ordersChange = momChange(stats?.ordersThisMonth, stats?.ordersLastMonth);
  const productsChange = momChange(stats?.productsThisMonth, stats?.productsLastMonth);
  // Pending has no last-month baseline from the backend, so its line is
  // a plain count ("+N new this month"), never a % vs nothing.
  const pendingNew = stats?.pendingNewThisMonth;
  const pendingChange = typeof pendingNew === 'number'
    ? (pendingNew > 0 ? `+${pendingNew} new this month` : 'No new this month')
    : undefined;
  // Total Users breakdown — staff counts only when the backend sends them.
  const usersSubline = stats ? [
    `${stats.suppliers} suppliers`,
    `${stats.shopkeepers} shopkeepers`,
    ...(typeof stats.admins === 'number' ? [`${stats.admins} admin`] : []),
    ...(typeof stats.subadmins === 'number' && stats.subadmins > 0 ? [`${stats.subadmins} sub-admin`] : []),
  ].join(' · ') : undefined;
  // Total Orders — latest order date from recentOrders (already returned).
  const latestOrderDate = recentOrders.length > 0 ? recentOrders[0].createdAt : undefined;
  const ordersSubline = latestOrderDate ? `Latest on ${formatDate(latestOrderDate)}` : undefined;

  // DASHBOARD-FIT 2026-11-28 — title mein admin ka apna naam (user.name;
  // businessName nahi, woh navbar mein dikhta hai). Naam na mile to purana title.
  const displayName = user?.name?.trim() || '';

  return (
    <div className="space-y-2.5">
      <PortalHeader
        title={displayName ? `Welcome ${displayName}` : 'Admin Dashboard'}
        hideSearch
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
          {/* Trade Volume is the primary hero card — daily revenue chart
              inside it, fed by /api/admin/trade-volume (zero-filled, so a
              day with no revenue shows 0 and no numbers are invented). */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
            <StatsCard
              title="Trade Volume"
              value={formatPKR(stats.revenue)}
              change={volumeChange}
              changeSuffix={volumeSuffix}
              isPositive={volumePositive}
              size="lg"
              className="lg:col-span-2 p-3 lg:flex lg:flex-col"
            >
              {/* Aapki kamai — the 2% fee earned in the SELECTED range
                  (exact platformFee sum, moves with the toggle). No
                  separate Earnings card: the fee lives here, in the hero. */}
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  Aapki kamai · 2% fee ·{' '}
                  <span className="font-bold text-slate-900 dark:text-white">
                    {feeShown !== null ? formatPKR(feeShown) : '…'}
                  </span>
                </span>
                {feeChange && (
                  <span className="flex items-center gap-1">
                    <span
                      className={cn(
                        'text-xs font-bold px-2 py-0.5 rounded-md',
                        feePositive
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
                      )}
                    >
                      {feeChange}
                    </span>
                    {feeSuffix ? <span className="text-xs text-slate-400">{feeSuffix}</span> : null}
                  </span>
                )}
              </p>
              <div className="mt-2 flex flex-1 flex-col min-h-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Revenue per day</p>
                  <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden" role="group" aria-label="Chart range">
                    {([7, 30, 90] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setTradeRange(r)}
                        aria-pressed={tradeRange === r}
                        className={tradeRange === r
                          ? 'px-2.5 py-1 text-xs font-bold bg-asan-accent text-white transition'
                          : 'px-2.5 py-1 text-xs font-bold bg-white dark:bg-slate-900 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition'}
                      >
                        {r}d
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-1 flex-1 min-h-0">
                  {tradeLoading && !tradePoints ? (
                    <div className="h-full min-h-[96px] rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse flex items-center justify-center">
                      <span className="text-xs text-slate-400">Loading chart…</span>
                    </div>
                  ) : tradePoints && tradePoints.length > 0 ? (
                    <TradeVolumeChart points={tradePoints} />
                  ) : (
                    <div className="h-full min-h-[96px] rounded-xl border border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center">
                      <span className="text-xs text-slate-400">
                        {tradeError ? 'Chart unavailable — daily revenue couldn’t be loaded.' : 'No sales in this period.'}
                      </span>
                    </div>
                  )}
                </div>
                {tradeError && tradePoints && tradePoints.length > 0 && (
                  <p className="mt-1.5 text-xs text-slate-400">Chart may be out of date — daily revenue couldn’t be refreshed.</p>
                )}
                {tradePoints && tradePoints.length > 0 && tradePoints.every((p) => p.revenue === 0) && (
                  <p className="mt-1.5 text-xs text-slate-400">No sales in this period.</p>
                )}
              </div>
            </StatsCard>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-2">
              <StatsCard
                title="Total Users"
                value={String(stats.users)}
                subline={usersSubline}
                change={usersChange?.change}
                changeSuffix={usersChange?.changeSuffix ?? ''}
                isPositive={usersChange?.isPositive ?? true}
                className="p-3"
              />
              <StatsCard
                title="Shopkeepers"
                value={String(stats.shopkeepers)}
                change={shopkeepersChange?.change}
                changeSuffix={shopkeepersChange?.changeSuffix ?? ''}
                isPositive={shopkeepersChange?.isPositive ?? true}
                className="p-3"
              />
              <StatsCard
                title="Suppliers"
                value={String(stats.suppliers)}
                change={suppliersChange?.change}
                changeSuffix={suppliersChange?.changeSuffix ?? ''}
                isPositive={suppliersChange?.isPositive ?? true}
                className="p-3 col-span-2 sm:col-span-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Link href="/admin/users" className="block h-full">
              <StatsCard
                title="Pending Verification"
                value={String(stats.pendingVerifications)}
                change={pendingChange ?? (stats.pendingVerifications > 0 ? `${stats.pendingVerifications} to review` : 'All verified')}
                changeSuffix=""
                isPositive={pendingChange ? true : stats.pendingVerifications === 0}
                className="p-3 h-full"
              />
            </Link>
            <StatsCard
              title="Products Listed"
              value={String(stats.products)}
              change={productsChange?.change}
              changeSuffix={productsChange?.changeSuffix ?? ''}
              isPositive={productsChange?.isPositive ?? true}
              className="p-3"
            />
            <StatsCard
              title="Total Orders"
              value={String(stats.orders)}
              subline={ordersSubline}
              change={ordersChange?.change}
              changeSuffix={ordersChange?.changeSuffix ?? ''}
              isPositive={ordersChange?.isPositive ?? true}
              className="p-3 col-span-2 sm:col-span-1"
            />
          </div>

          {/* ── Latest listings ──────────────────────────────────────────────
              Every thumbnail is the real photo the supplier attached in Add
              Product (/uploads/products/<file>), so moderators see exactly
              what buyers see — never a stock/placeholder image.
              MOBILE (2026-11-28): cards are a compact horizontal row — a
              64px thumb + details — 1 column below md, so one card never
              dominates the screen and a no-photo product is a small 64px
              grey box, not a full-width square. md+ is unchanged: the
              vertical card (full-width square image) in 3 cols (md) / 6
              cols (lg). */}
          {recentProducts.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Boxes className="w-5 h-5 text-asan-accent" />
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Latest Listings</h3>
                </div>
                <Link href="/admin/products" className="text-xs font-bold text-asan-accent dark:text-asan-accent-light hover:underline">
                  Manage all products →
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
                {recentProducts.map((p) => (
                  <Link
                    key={p.id}
                    href="/admin/products"
                    className="group flex md:block items-center gap-3 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition md:space-y-2"
                  >
                    <ProductImage
                      src={p.image}
                      alt={p.name}
                      className="w-16 h-16 shrink-0 rounded-xl object-cover md:w-full md:h-auto md:aspect-square"
                      fill
                      sizes="(max-width: 768px) 64px, (max-width: 1024px) 33vw, 16vw"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate" title={p.name}>
                        {p.name}
                      </p>
                      <p className="text-xs text-slate-400 truncate">
                        {formatPKR(p.price)} / {p.unit}
                      </p>
                      <p className="text-xs text-slate-400 truncate" title={p.supplierName}>
                        by {p.supplierName}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Recent Orders</h3>
              <Link href="/admin/orders" className="text-xs font-bold text-asan-accent dark:text-asan-accent-light hover:underline">
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
