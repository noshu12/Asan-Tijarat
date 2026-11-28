"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProductCard } from '@/components/ProductCard';
import { Footer } from '@/components/Footer';
import { Dropdown } from '@/components/ui/dropdown';
import { Search, X, ChevronLeft, ChevronRight, Tag, MapPin, ArrowUpNarrowWide, ArrowDownWideNarrow } from 'lucide-react';
import { api } from '@/lib/api';
import { Product } from '@/lib/types';
import { trackFilterUsed, trackSearch } from '@/lib/analytics';
import { idFromEventLink, PRODUCT_UPDATE_EVENT_TYPES, useRealtime, useRealtimeEvent } from '@/hooks/useRealtime';
type SortOption = 'price-asc' | 'price-desc';

const MARKETPLACE_CATEGORIES: { id: string; name: string }[] = [
  { id: 'all', name: 'All' },
  { id: 'staples-grains-flours', name: 'Staples, Grains & Flours' },
  { id: 'pulses-lentils-beans', name: 'Pulses, Lentils & Beans' },
  { id: 'cooking-oils-ghee-fats', name: 'Cooking Oils, Ghee & Fats' },
  { id: 'spices-herbs-baking', name: 'Spices, Herbs & Baking' },
  { id: 'packaged-foods-recipe-mixes-sauces', name: 'Packaged Foods, Recipe Mixes & Sauces' },
  { id: 'beverages-cold-corner', name: 'Beverages & Cold Corner' },
  { id: 'tea-coffee-dairy', name: 'Tea, Coffee & Dairy' },
  { id: 'snacks-biscuits-confectionery', name: 'Snacks, Biscuits & Confectionery' },
  { id: 'instant-ready-to-cook-foods', name: 'Instant & Ready-to-Cook Foods' },
  { id: 'home-cleaning-sanitation', name: 'Home Cleaning & Sanitation' },
  { id: 'personal-care-hygiene', name: 'Personal Care & Hygiene' },
  { id: 'mother-baby-care', name: 'Mother & Baby Care' },
  { id: 'paper-products-wraps-utilities', name: 'Paper Products, Wraps & Utilities' },
  { id: 'over-the-counter-healthcare', name: 'Over-the-Counter Healthcare' },
];

const CATEGORY_PRODUCT_MATCHES: Record<string, string[]> = {
  'staples-grains-flours': ['Staples, Grains & Flours'],
  'pulses-lentils-beans': ['Pulses, Lentils & Beans'],
  'cooking-oils-ghee-fats': ['Cooking Oils, Ghee & Fats'],
  'spices-herbs-baking': ['Spices, Herbs & Baking'],
  'packaged-foods-recipe-mixes-sauces': ['Packaged Foods, Recipe Mixes & Sauces'],
  'beverages-cold-corner': ['Beverages & Cold Corner'],
  'tea-coffee-dairy': ['Tea, Coffee & Dairy'],
  'snacks-biscuits-confectionery': ['Snacks, Biscuits & Confectionery'],
  'instant-ready-to-cook-foods': ['Instant & Ready-to-Cook Foods'],
  'home-cleaning-sanitation': ['Home Cleaning & Sanitation'],
  'personal-care-hygiene': ['Personal Care & Hygiene'],
  'mother-baby-care': ['Mother & Baby Care'],
  'paper-products-wraps-utilities': ['Paper Products, Wraps & Utilities'],
  'over-the-counter-healthcare': ['Over-the-Counter Healthcare'],
};

const PAGE_SIZE = 12;

/**
 * `useSearchParams()` triggers a CSR bailout during static prerender —
 * Next.js 14 requires the component reading it to sit behind a Suspense
 * boundary, otherwise `next build` fails on this route.
 */
export default function MarketplacePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center bg-slate-50 dark:bg-slate-950">
          <div className="h-10 w-10 rounded-full border-4 border-slate-200 border-t-asan-accent animate-spin" />
        </div>
      }
    >
      <MarketplaceContent />
    </Suspense>
  );
}

function MarketplaceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Filters initialise from the URL so shared links and back/forward work.
  const [selectedCategory, setSelectedCategory] = useState(() => searchParams.get('cat') ?? 'all');
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('search') ?? '');
  const [sortBy, setSortBy] = useState<SortOption>(() =>
    searchParams.get('sort') === 'price-desc' ? 'price-desc' : 'price-asc'
  );
  const [city, setCity] = useState(() => searchParams.get('city') ?? '');
  const [minPrice, setMinPrice] = useState(() => searchParams.get('min') ?? '');
  const [maxPrice, setMaxPrice] = useState(() => searchParams.get('max') ?? '');
  const [inStockOnly, setInStockOnly] = useState(() => searchParams.get('stock') === '1');
  const [page, setPage] = useState(() => Math.max(1, parseInt(searchParams.get('page') ?? '', 10) || 1));

  // Server-driven catalogue — filtering, sorting and paging all happen in
  // the backend (GET /api/products). No mock fallback: a backend failure
  // shows an empty list instead of fake products.
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const totalRef = useRef(total);
  totalRef.current = total;
  const [totalPages, setTotalPages] = useState(1);
  const [cities, setCities] = useState<string[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  // Batch 13 — live marketplace. Before Batch 24 no product event
  // type existed in the agreed SSE list, so new listings arrived via a
  // reconnect / tab-visible sync: the sync refetch MERGES instead of
  // replacing — products that appeared since the last load are
  // prepended with a "New" badge, and prices/stock on visible cards
  // update in place. Filters, search text, sort, page and scroll are
  // never touched. Batch 24 keeps that sync merge AND adds the live
  // events (Batch 23) below, for listings that appear while the tab
  // is open.
  const [refreshKey, setRefreshKey] = useState(0);
  const [newIds, setNewIds] = useState<ReadonlySet<string>>(new Set());
  const productsRef = useRef<Product[]>([]);
  // Batch 24 hardening — in-flight prepend guard. Batch 23 sends a
  // catalogue event twice to admins (targeted notifyAdmins + public
  // broadcast); both frames derive the same productId, and if both
  // fetches resolve in the same tick the post-fetch id check can pass
  // twice before either prepends. The pending set stops the second
  // frame before it fetches; the id-exists checks stay as well.
  const pendingProductPrependRef = useRef(new Set<string>());
  const syncRefreshRef = useRef(false);
  const { syncKey } = useRealtime();
  const lastSyncKeyRef = useRef(0);
  useEffect(() => {
    if (lastSyncKeyRef.current === syncKey) return;
    lastSyncKeyRef.current = syncKey;
    syncRefreshRef.current = true;
    setRefreshKey((k) => k + 1);
  }, [syncKey]);

  // Category / Price / City filters use the shared <Dropdown>
  // (components/ui/dropdown.tsx) — it handles its own open/close,
  // outside click and Escape, so no dropdown state lives here.

  // Debounced search so we don't hit the API on every keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  // Batch 16 — B8 GA4 search event: once per debounced term, not per
  // keystroke. Clearing the box resets the guard so typing the same term
  // again fires again. Landing on ?search=... fires once — that IS a
  // search view.
  const searchTrackedRef = useRef('');
  useEffect(() => {
    const term = debouncedSearch.trim();
    if (!term) {
      searchTrackedRef.current = '';
      return;
    }
    if (term === searchTrackedRef.current) return;
    searchTrackedRef.current = term;
    trackSearch(term);
  }, [debouncedSearch]);

  // Min/max are debounced too — typing a price must not refetch per keystroke.
  const [debouncedMin, setDebouncedMin] = useState(minPrice);
  const [debouncedMax, setDebouncedMax] = useState(maxPrice);
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedMin(minPrice), 400);
    return () => window.clearTimeout(t);
  }, [minPrice]);
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedMax(maxPrice), 400);
    return () => window.clearTimeout(t);
  }, [maxPrice]);

  // Batch 16 — B8 GA4 filter_used for the price fields: the refs start
  // at the current value, so mounting with ?min=/?max= in the URL does
  // NOT fire — only a real change does. 'any' = field cleared.
  const minTrackedRef = useRef<string | null>(null);
  useEffect(() => {
    if (minTrackedRef.current === null) {
      minTrackedRef.current = debouncedMin;
      return;
    }
    if (minTrackedRef.current === debouncedMin) return;
    minTrackedRef.current = debouncedMin;
    trackFilterUsed('min_price', debouncedMin.trim() || 'any');
  }, [debouncedMin]);
  const maxTrackedRef = useRef<string | null>(null);
  useEffect(() => {
    if (maxTrackedRef.current === null) {
      maxTrackedRef.current = debouncedMax;
      return;
    }
    if (maxTrackedRef.current === debouncedMax) return;
    maxTrackedRef.current = debouncedMax;
    trackFilterUsed('max_price', debouncedMax.trim() || 'any');
  }, [debouncedMax]);

  // City options for the filter dropdown — distinct cities with live listings.
  useEffect(() => {
    let cancelled = false;
    api.productCities()
      .then((data) => { if (!cancelled) setCities(data.cities); })
      .catch(() => { if (!cancelled) setCities([]); });
    return () => { cancelled = true; };
  }, []);

  // Keep state in sync when the URL changes (back/forward, pasted links).
  useEffect(() => {
    setSelectedCategory(searchParams.get('cat') ?? 'all');
    setSearchQuery(searchParams.get('search') ?? '');
    setSortBy(searchParams.get('sort') === 'price-desc' ? 'price-desc' : 'price-asc');
    setCity(searchParams.get('city') ?? '');
    setMinPrice(searchParams.get('min') ?? '');
    setMaxPrice(searchParams.get('max') ?? '');
    setInStockOnly(searchParams.get('stock') === '1');
    setPage(Math.max(1, parseInt(searchParams.get('page') ?? '', 10) || 1));
  }, [searchParams]);

  // Write filter state back into the URL (replace, not push — no history spam).
  // The compare guard stops write→sync→write loops.
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedCategory !== 'all') params.set('cat', selectedCategory);
    if (searchQuery.trim()) params.set('search', searchQuery.trim());
    if (sortBy !== 'price-asc') params.set('sort', sortBy);
    if (city) params.set('city', city);
    if (debouncedMin.trim()) params.set('min', debouncedMin.trim());
    if (debouncedMax.trim()) params.set('max', debouncedMax.trim());
    if (inStockOnly) params.set('stock', '1');
    if (page > 1) params.set('page', String(page));
    const qs = params.toString();
    if (qs !== searchParams.toString()) {
      router.replace(`/marketplace${qs ? `?${qs}` : ''}`, { scroll: false });
    }
  }, [selectedCategory, searchQuery, sortBy, city, debouncedMin, debouncedMax, inStockOnly, page, router, searchParams]);

  // Batch 24 — live product events (Batch 23 added them to the SSE
  // enum). product_created: GET that ONE product and prepend it to the
  // top of the list — no full refetch, no spinner, scroll position
  // untouched. A listing is only prepended on page 1 and only when it
  // matches the filters the user has set (same rules as the server
  // query), so a filtered view never gains a row that does not belong
  // there. product_updated / stock_updated / price_updated: GET the
  // one product and replace its card in place, if it is on screen.
  // A failed single fetch is live-only noise — it never clears the
  // list or shows an error.
  useRealtimeEvent(
    ['product_created', ...PRODUCT_UPDATE_EVENT_TYPES],
    (event) => {
      const productId = idFromEventLink(event.link, 'product');
      if (!productId) return;
      if (event.type === 'product_created') {
        if (page !== 1) return; // new listings belong on page 1, not here
        if (productsRef.current.some((p) => p.id === productId)) return;
        if (pendingProductPrependRef.current.has(productId)) return;
        pendingProductPrependRef.current.add(productId);
        void api.product(productId).then((data) => {
          const p = data.product;
          if (!p) return;
          if (productsRef.current.some((x) => x.id === p.id)) return;
          if (selectedCategory !== 'all') {
            const names = CATEGORY_PRODUCT_MATCHES[selectedCategory];
            if (!names || !names.includes(p.category)) return;
          }
          const q = debouncedSearch.trim().toLowerCase();
          // SEARCH-NAME-ONLY 2026-11-28 — search sirf product NAME se.
          if (q && !p.name.toLowerCase().includes(q)) return;
          if (city && p.supplierCity !== city) return;
          const min = debouncedMin.trim() === '' ? undefined : Number(debouncedMin);
          const max = debouncedMax.trim() === '' ? undefined : Number(debouncedMax);
          if (min !== undefined && Number.isFinite(min) && p.price < min) return;
          if (max !== undefined && Number.isFinite(max) && p.price > max) return;
          if (inStockOnly && p.stock <= 0) return;
          const merged = [p, ...productsRef.current];
          productsRef.current = merged;
          setProducts(merged);
          setNewIds((old) => {
            const next = new Set(old);
            next.add(p.id);
            return next;
          });
          const newTotal = totalRef.current + 1;
          setTotal(newTotal);
          setTotalPages(Math.max(1, Math.ceil(newTotal / PAGE_SIZE)));
        }).catch(() => {}).finally(() => {
          pendingProductPrependRef.current.delete(productId);
        });
        return;
      }
      if (!productsRef.current.some((p) => p.id === productId)) return;
      void api.product(productId).then((data) => {
        const p = data.product;
        if (!p) return;
        const merged = productsRef.current.map((x) => (x.id === p.id ? p : x));
        productsRef.current = merged;
        setProducts(merged);
      }).catch(() => {});
    },
  );

  // Fetch the current page from the server whenever filters change.
  useEffect(() => {
    let cancelled = false;
    // Backend expects the exact category name; unknown slugs fall back to 'all'.
    const categoryName =
      selectedCategory === 'all' ? 'all' : (CATEGORY_PRODUCT_MATCHES[selectedCategory]?.[0] ?? 'all');
    const min = debouncedMin.trim() === '' ? undefined : Number(debouncedMin);
    const max = debouncedMax.trim() === '' ? undefined : Number(debouncedMax);
    api.products({
      search: debouncedSearch.trim() || undefined,
      category: categoryName,
      sort: sortBy,
      city: city || undefined,
      minPrice: min !== undefined && Number.isFinite(min) ? min : undefined,
      maxPrice: max !== undefined && Number.isFinite(max) ? max : undefined,
      inStock: inStockOnly || undefined,
      page,
      limit: PAGE_SIZE,
    })
      .then((data) => {
        if (cancelled) return;
        // Batch 13 — sync refetch merges (see above); a filter/search/
        // sort/page change replaces the list as before.
        const merging = syncRefreshRef.current;
        syncRefreshRef.current = false;
        if (!merging) {
          productsRef.current = data.products;
          setProducts(data.products);
        } else {
          const prev = productsRef.current;
          if (prev.length === 0) {
            productsRef.current = data.products;
            setProducts(data.products);
          } else {
            const prevIds = new Set(prev.map((p) => p.id));
            const fresh = data.products.filter((p) => !prevIds.has(p.id));
            const freshMap = new Map(data.products.map((p) => [p.id, p]));
            if (fresh.length > 0) {
              setNewIds((old) => {
                const next = new Set(old);
                fresh.forEach((p) => next.add(p.id));
                return next;
              });
              const merged = [...fresh, ...prev.map((p) => freshMap.get(p.id) ?? p)];
              productsRef.current = merged;
              setProducts(merged);
            } else {
              // No new listings — update price/stock in place, keep order.
              const merged = prev.map((p) => freshMap.get(p.id) ?? p);
              productsRef.current = merged;
              setProducts(merged);
            }
          }
        }
        setTotal(data.total ?? data.products.length);
        setTotalPages(data.totalPages ?? 1);
        // The backend clamps out-of-range pages — mirror it so the UI stays truthful.
        if (data.page && data.page !== page) setPage(data.page);
      })
      .catch(() => {
        if (cancelled) return;
        setProducts([]);
        setTotal(0);
        setTotalPages(1);
      })
      .finally(() => {
        if (cancelled) return;
        setIsInitialLoading(false);
      });
    return () => { cancelled = true; };
  }, [debouncedSearch, selectedCategory, sortBy, city, debouncedMin, debouncedMax, inStockOnly, page, refreshKey]);

  const resetFilters = () => {
    setSelectedCategory('all');
    setSearchQuery('');
    setSortBy('price-asc');
    setCity('');
    setMinPrice('');
    setMaxPrice('');
    setInStockOnly(false);
    setPage(1);
  };

  const hasActiveFilters =
    selectedCategory !== 'all' || searchQuery.trim() !== '' || city !== '' ||
    minPrice.trim() !== '' || maxPrice.trim() !== '' || inStockOnly;

  const goToPage = (p: number) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const pageWindow = useMemo(() => {
    const windowSize = 5;
    let start = Math.max(1, page - Math.floor(windowSize / 2));
    const end = Math.min(totalPages, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);
    const arr: number[] = [];
    for (let p = start; p <= end; p++) arr.push(p);
    return arr;
  }, [page, totalPages]);

  const inputCls =
    'px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:border-asan-accent';

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950">

      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Heading row: title on the left; search bar, Category and
              Price dropdowns in the same row on the right. */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
                Public Marketplace
              </h1>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-3 flex-1 w-full md:w-auto">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  aria-label="Search marketplace products"
                  type="text"
                  placeholder="Search product name (e.g. Basmati Rice)..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                  className="w-full pl-10 pr-12 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:border-asan-accent transition"
                />
                {searchQuery && (
                  <button
                    type="button"
                    aria-label="Clear marketplace search"
                    onClick={() => { setSearchQuery(''); setPage(1); }}
                    className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <Dropdown
                  options={MARKETPLACE_CATEGORIES.map((cat) => ({
                    value: cat.id,
                    label: cat.name,
                    icon: <Tag className="w-4 h-4 shrink-0 text-slate-400" />,
                  }))}
                  value={selectedCategory}
                  onChange={(v) => {
                    setSelectedCategory(v);
                    setPage(1);
                    trackFilterUsed('category', MARKETPLACE_CATEGORIES.find((c) => c.id === v)?.name ?? v);
                  }}
                  prefix="Category"
                  ariaLabel="Categories"
                  buttonClassName={`${inputCls} flex items-center gap-2 whitespace-nowrap`}
                />
                <Dropdown
                  options={[
                    { value: 'price-asc', label: 'Low to High', icon: <ArrowUpNarrowWide className="w-4 h-4 shrink-0 text-slate-400" /> },
                    { value: 'price-desc', label: 'High to Low', icon: <ArrowDownWideNarrow className="w-4 h-4 shrink-0 text-slate-400" /> },
                  ]}
                  value={sortBy}
                  onChange={(v) => { setSortBy(v as SortOption); setPage(1); trackFilterUsed('sort', v); }}
                  prefix="Price"
                  ariaLabel="Sort by price"
                  search={false}
                  buttonClassName={`${inputCls} flex items-center gap-2 whitespace-nowrap`}
                />
              </div>
            </div>

          </div>

          {/* Extra filters: city, price range, in-stock */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Dropdown
              options={[
                { value: '', label: 'All Cities', icon: <MapPin className="w-4 h-4 shrink-0 text-slate-400" /> },
                ...cities.map((c) => ({
                  value: c,
                  label: c,
                  icon: <MapPin className="w-4 h-4 shrink-0 text-slate-400" />,
                })),
              ]}
              value={city}
              onChange={(v) => { setCity(v); setPage(1); trackFilterUsed('city', v || 'all'); }}
              ariaLabel="Filter by supplier city"
              search={false}
              align="left"
              buttonClassName={`${inputCls} flex items-center gap-2 whitespace-nowrap`}
            />
            <input
              aria-label="Minimum price"
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="Min Rs"
              value={minPrice}
              onChange={(e) => { setMinPrice(e.target.value); setPage(1); }}
              className={`${inputCls} w-28`}
            />
            <input
              aria-label="Maximum price"
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="Max Rs"
              value={maxPrice}
              onChange={(e) => { setMaxPrice(e.target.value); setPage(1); }}
              className={`${inputCls} w-28`}
            />
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(e) => { setInStockOnly(e.target.checked); setPage(1); trackFilterUsed('in_stock', e.target.checked ? 'only' : 'all'); }}
                className="w-4 h-4 rounded accent-asan-accent"
              />
              In stock only
            </label>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 underline underline-offset-2"
              >
                Clear all
              </button>
            )}
          </div>

        </div>
      </div>

      {/* Product Grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex-1 w-full">
        {products.length === 0 && !isInitialLoading ? (
          <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400 mb-4">
              <Search className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">No products found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              No matching commodities for the selected filters. Try a different city, price range, or search term.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-4 px-4 py-2 rounded-xl bg-asan-accent text-white text-xs font-semibold"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} isNew={newIds.has(product.id)} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={page <= 1}
                  onClick={() => goToPage(page - 1)}
                  className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {pageWindow.map((p) => (
                  <button
                    type="button"
                    key={p}
                    onClick={() => goToPage(p)}
                    aria-current={p === page ? 'page' : undefined}
                    className={`min-w-[44px] min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold transition ${
                      p === page
                        ? 'bg-asan-dark text-white shadow-md'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={page >= totalPages}
                  onClick={() => goToPage(page + 1)}
                  className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                  Page {page} of {totalPages}
                </span>
              </div>
            )}
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
