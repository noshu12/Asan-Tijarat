"use client";

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProductCard } from '@/components/ProductCard';
import { Footer } from '@/components/Footer';
import { Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { Product } from '@/lib/types';
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
  const [totalPages, setTotalPages] = useState(1);
  const [cities, setCities] = useState<string[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);

  // Debounced search so we don't hit the API on every keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

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

  // Fetch the current page from the server whenever filters change.
  useEffect(() => {
    let cancelled = false;
    setIsFetching(true);
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
        setProducts(data.products);
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
        setIsFetching(false);
        setIsInitialLoading(false);
      });
    return () => { cancelled = true; };
  }, [debouncedSearch, selectedCategory, sortBy, city, debouncedMin, debouncedMax, inStockOnly, page]);

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
    'px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:border-asan-accent';

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950">

      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Wholesale Commodities Directory
              </span>
              <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
                Public Marketplace
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                Direct wholesale rates from verified Pakistani farmers, millers & factories
              </p>
            </div>

            {/* Quick Stats Badges */}
            <div className="flex items-center gap-2 flex-wrap justify-center">
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-2">
                {isFetching && !isInitialLoading && (
                  <span className="h-3 w-3 rounded-full border-2 border-slate-300 border-t-asan-accent animate-spin" />
                )}
                {total} Lots Available
              </span>
            </div>
          </div>

          {isInitialLoading && (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <span className="h-3.5 w-3.5 rounded-full border-2 border-slate-200 border-t-asan-accent animate-spin" />
              Loading catalogue from the backend…
            </div>
          )}

          {/* Search Bar + Sort */}
          <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                aria-label="Search marketplace products"
                type="text"
                placeholder="Search products, suppliers, cities (e.g. Basmati Rice, Faisalabad Cotton, Multan)..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:border-asan-accent transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Clear marketplace search"
                  onClick={() => { setSearchQuery(''); setPage(1); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              {/* Sort By Dropdown */}
              <select
                value={sortBy}
                onChange={(e) => { setSortBy(e.target.value as SortOption); setPage(1); }}
                className={inputCls}
              >
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
              </select>
            </div>
          </div>

          {/* Extra filters: city, price range, in-stock */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select
              aria-label="Filter by supplier city"
              value={city}
              onChange={(e) => { setCity(e.target.value); setPage(1); }}
              className={inputCls}
            >
              <option value="">All Cities</option>
              {cities.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
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
                onChange={(e) => { setInStockOnly(e.target.checked); setPage(1); }}
                className="w-4 h-4 rounded accent-emerald-600"
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

          {/* Category Filter Pills */}
          <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            {MARKETPLACE_CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  type="button"
                  aria-pressed={isSelected}
                  key={cat.id}
                  onClick={() => { setSelectedCategory(cat.id); setPage(1); }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                    isSelected
                      ? 'bg-asan-dark text-white shadow-md'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700'
                  }`}
                >
                  {cat.name}
                </button>
              );
            })}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-10 flex items-center justify-center gap-2">
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={page <= 1}
                  onClick={() => goToPage(page - 1)}
                  className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {pageWindow.map((p) => (
                  <button
                    type="button"
                    key={p}
                    onClick={() => goToPage(p)}
                    aria-current={p === page ? 'page' : undefined}
                    className={`min-w-[2.5rem] px-3 py-2 rounded-xl text-xs font-bold transition ${
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
                  className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
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
