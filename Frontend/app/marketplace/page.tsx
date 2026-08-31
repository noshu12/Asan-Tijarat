"use client";

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CATEGORIES_LIST } from '@/lib/mockData';
import { useProducts } from '@/context/ProductContext';
import { ProductCard } from '@/components/ProductCard';
import { Footer } from '@/components/Footer';
import { Search, ShieldCheck, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
type SortOption = 'rating' | 'price-asc' | 'price-desc' | 'orders';

const CATEGORY_PRODUCT_MATCHES: Record<string, string[]> = {
  'rice-grains': ['Rice & Grains'],
  spices: ['Spices'],
  textiles: ['Textiles'],
  dairy: ['Dairy', 'Dairy & Oils'],
  minerals: ['Minerals'],
  vegetables: ['Vegetables'],
};

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
  const searchParams = useSearchParams();
  const { products } = useProducts();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('rating');

  useEffect(() => {
    setSearchQuery(searchParams.get('search') ?? '');
    setSelectedCategory(searchParams.get('cat') ?? 'all');
  }, [searchParams]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      // Category filter
      if (selectedCategory !== 'all') {
        const matchingCategories = CATEGORY_PRODUCT_MATCHES[selectedCategory];
        if (!matchingCategories?.includes(product.category)) {
          return false;
        }
      }

      // Verified filter
      if (verifiedOnly && !product.supplierVerified) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchName = product.name.toLowerCase().includes(query);
        const matchSupplier = product.supplierName.toLowerCase().includes(query);
        const matchCity = product.supplierCity.toLowerCase().includes(query);
        const matchCategory = product.category.toLowerCase().includes(query);
        if (!matchName && !matchSupplier && !matchCity && !matchCategory) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'price-asc') return a.price - b.price;
      if (sortBy === 'price-desc') return b.price - a.price;
      if (sortBy === 'orders') return b.ordersCount - a.ordersCount;
      return b.rating - a.rating;
    });
  }, [products, selectedCategory, searchQuery, verifiedOnly, sortBy]);

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
            <div className="flex items-center gap-2">
              <Badge variant="verified" className="py-1 px-3">
                <ShieldCheck className="w-3.5 h-3.5" />
                100% Escrow Protected
              </Badge>
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {filteredProducts.length} Lots Available
              </span>
            </div>
          </div>

          {/* Search Bar + Controls */}
          <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                aria-label="Search marketplace products"
                type="text"
                placeholder="Search products, suppliers, cities (e.g. Basmati Rice, Faisalabad Cotton, Multan)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:border-asan-accent transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Clear marketplace search"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              {/* Verified Filter Toggle */}
              <button
                type="button"
                aria-pressed={verifiedOnly}
                onClick={() => setVerifiedOnly(!verifiedOnly)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition shrink-0 ${
                  verifiedOnly
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Verified Only</span>
              </button>

              {/* Sort By Dropdown */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none"
              >
                <option value="rating">Sort: Top Rated</option>
                <option value="orders">Sort: Most Orders</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
              </select>
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            {CATEGORIES_LIST.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  type="button"
                  aria-pressed={isSelected}
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex-1">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400 mb-4">
              <Search className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">No products found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              No matching commodities for &quot;{searchQuery}&quot;. Try searching for rice, spices, salt, ghee or textiles.
            </p>
            <button
              type="button"
              onClick={() => { setSearchQuery(''); setSelectedCategory('all'); setVerifiedOnly(false); }}
              className="mt-4 px-4 py-2 rounded-xl bg-asan-accent text-white text-xs font-semibold"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
