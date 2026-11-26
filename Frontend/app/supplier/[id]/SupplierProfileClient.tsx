"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, MapPin, Package } from 'lucide-react';
import { api, ApiError, type PublicSupplierProfile } from '@/lib/api';
import { Footer } from '@/components/Footer';
import { ProductCard } from '@/components/ProductCard';

/**
 * Public supplier profile page — /suppliers/[id] (Group 1, NEW).
 *
 * Layout follows the brief's lawyer-profile reference, adapted for a
 * supplier: header with company name + city + join date + category pills,
 * one stats row (rating + products sold), then their products below.
 *
 * Data comes from GET /api/public/suppliers/:id — everything shown is
 * real data from that endpoint. Ratings live per-supplier on delivered
 * orders; a supplier with no reviews yet shows "-" for the rating.
 * No Verified badge: the endpoint carries no verified flag, and a badge
 * would have to be invented.
 */
export default function SupplierProfileClient({ id }: { id: string }) {
  const [supplier, setSupplier] = useState<PublicSupplierProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<'not-found' | 'failed' | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    api
      .publicSupplier(id)
      .then((data) => {
        if (cancelled) return;
        setSupplier(data.supplier);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoading(false);
        if (err instanceof ApiError && err.status === 404) {
          setLoadError('not-found');
        } else {
          setLoadError('failed');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="h-10 w-10 rounded-full border-4 border-slate-200 border-t-asan-accent animate-spin" />
      </div>
    );
  }

  // 'failed' must be checked BEFORE the not-found branch: on a load
  // failure supplier is still null, so `!supplier` would wrongly show
  // "Supplier not found" for a server/connection error.
  if (loadError === 'failed') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-slate-950 px-4 text-center">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Couldn&apos;t load this supplier</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          The server didn&apos;t respond. Check your connection and try again.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-5 py-2.5 rounded-xl bg-asan-accent hover:bg-asan-accent-hover text-white text-sm font-bold shadow-md transition"
        >
          Try again
        </button>
      </div>
    );
  }

  if (loadError === 'not-found' || !supplier) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-slate-950 px-4 text-center">
        <Package className="w-12 h-12 text-slate-300 dark:text-slate-600" />
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Supplier not found</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          This supplier may have been removed, or the link is wrong.
        </p>
        <Link
          href="/marketplace"
          className="px-5 py-2.5 rounded-xl bg-asan-accent hover:bg-asan-accent-hover text-white text-sm font-bold shadow-md transition"
        >
          Back to Marketplace
        </Link>
      </div>
    );
  }

  const joinedDate = new Date(supplier.joinedAt);
  const joinedLabel = Number.isNaN(joinedDate.getTime())
    ? ''
    : joinedDate.toLocaleDateString('en-PK', { month: 'short', year: 'numeric' });
  const hasRating = supplier.rating.count > 0;

  return (
    <div className="bg-slate-50 dark:bg-slate-950 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <Link
          href="/marketplace"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-asan-accent transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Marketplace
        </Link>

        {/* Header: company name, city, join date, category pills */}
        <div className="mt-4 flex items-start gap-4">
          <div className="w-14 h-14 shrink-0 rounded-full bg-asan-accent-light grid place-items-center text-2xl font-extrabold text-asan-accent">
            {supplier.businessName.trim().charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white leading-tight">
              {supplier.businessName}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-0.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                {supplier.city}
              </span>
              {joinedLabel && (
                <>
                  <span>•</span>
                  <span>Joined {joinedLabel}</span>
                </>
              )}
            </p>
            {supplier.categories.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {supplier.categories.map((category) => (
                  <span
                    key={category}
                    className="px-3 py-1 rounded-full bg-asan-accent-light text-xs font-bold text-asan-accent"
                  >
                    {category}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* One stats row: rating + products sold */}
        <div className="mt-6 grid grid-cols-2 gap-2 max-w-md">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 text-center">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Rating</p>
            {hasRating ? (
              <p className="mt-1 flex items-center justify-center gap-1.5 whitespace-nowrap">
                <span aria-label={`Rated ${supplier.rating.average} out of 5`} className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span
                      key={n}
                      className={n <= Math.round(supplier.rating.average) ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600'}
                    >
                      ★
                    </span>
                  ))}
                </span>
                <span className="text-[clamp(11px,0.9vw+4px,15px)] font-extrabold text-slate-900 dark:text-white">
                  {supplier.rating.average}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  ({supplier.rating.count} review{supplier.rating.count === 1 ? '' : 's'})
                </span>
              </p>
            ) : (
              <p className="mt-1 text-[clamp(11px,0.9vw+4px,15px)] font-extrabold text-slate-900 dark:text-white whitespace-nowrap">
                -
              </p>
            )}
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 text-center">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Products sold</p>
            <p className="text-[clamp(11px,0.9vw+4px,15px)] font-extrabold text-slate-900 dark:text-white mt-1 whitespace-nowrap">
              {supplier.productsSold}
            </p>
          </div>
        </div>

        {/* Their products */}
        <section className="mt-10">
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">Products</h2>
          {supplier.products.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No products listed yet.</p>
          ) : (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {supplier.products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </section>
      </div>
      <Footer />
    </div>
  );
}
