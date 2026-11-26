"use client";

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MapPin, Minus, Plus, Check, Store, Package } from 'lucide-react';
import { api, API_URL, ApiError, type PublicSupplierProfile } from '@/lib/api';
import { Product } from '@/lib/types';
import { formatPKR } from '@/lib/utils';
import { ProductImage } from '@/components/ProductImage';
import { Badge } from '@/components/ui/badge';
import { Footer } from '@/components/Footer';
import { useAuth } from '@/context/AuthProvider';
import { addToCart } from '@/lib/cart';
import { trackAddToCart, trackProductView } from '@/lib/analytics';
import { parsePack, ProductCard } from '@/components/ProductCard';
import { idFromEventLink, useRealtime, useRealtimeEvent } from '@/hooks/useRealtime';

type MarketSale = {
  productId: string;
  days: number;
  bagsSold: number;
  shopkeepers: number;
};

/**
 * Product detail page (audit fix #6) — /product/[id].
 *
 * The marketplace cards used to open a detail popup only; there was no
 * shareable, linkable product page at all (/product/* all 404). This page
 * is the same content as that popup, as a real route: gallery, full specs,
 * supplier profile, MOQ/pack breakdown, and the same Add to Cart flow the
 * cards use (same guards, same lib/cart helper).
 *
 * Data comes from GET /api/products/:id (public, already existed — no new
 * backend endpoint was needed). The supplier Rating / Reviews sections
 * below come from the public supplier endpoint
 * GET /api/public/suppliers/:id — ratings live per-supplier on delivered
 * orders, so there are no product-level ratings; the sections show the
 * supplier's rating and reviews, and no Verified badge is shown here — a
 * badge would have to be invented, and it must not be.
 *
 * This is the CLIENT half of the page (audit fix #13 split): the server
 * page.tsx next to it exports generateMetadata and renders this component.
 * Everything in here — gallery, specs, supplier, MOQ breakdown, Add to Cart,
 * loading / not-found / failed states — is unchanged from audit fix #6.
 */
export default function ProductDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<'not-found' | 'failed' | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [marketSale, setMarketSale] = useState<MarketSale | null>(null);
  // Batch 13 — live stock/price revalidation (small client wrapper, kept
  // minimal on purpose: NO JSON-LD here — a later step adds it on top of
  // this version). Before Batch 24 no product event type existed in the
  // agreed SSE list, so this refetched on a reconnect / tab-visible sync
  // only. Batch 24 keeps that sync AND adds the live stock_updated /
  // price_updated events (Batch 23): when the event's link id matches
  // THIS product, the same silent refetch below runs — no spinner, no
  // page reload, gallery selection and typed qty untouched; if the new
  // stock is below the picked qty, the qty is clamped down and a note
  // says so — the cart itself is never touched here.
  const [refreshKey, setRefreshKey] = useState(0);
  const [stockNotice, setStockNotice] = useState<string | null>(null);
  // Group 1 — bottom sections: related products (same category) and the
  // supplier's profile (rating + reviews), fetched once per product.
  // Both stay hidden on failure — they must never show a guessed number.
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [supplierProfile, setSupplierProfile] = useState<PublicSupplierProfile | null>(null);
  const relatedForRef = useRef<string | null>(null);
  const supplierForRef = useRef<string | null>(null);
  // Group 1 — MOQ popup: shown when a typed quantity is below the MOQ.
  const [moqPopup, setMoqPopup] = useState(false);
  const moqTimerRef = useRef<number | null>(null);
  const qtyRef = useRef(qty);
  qtyRef.current = qty;
  const { syncKey } = useRealtime();
  const lastSyncKeyRef = useRef(0);
  useEffect(() => {
    if (lastSyncKeyRef.current === syncKey) return;
    lastSyncKeyRef.current = syncKey;
    setRefreshKey((k) => k + 1);
  }, [syncKey]);
  useRealtimeEvent(['stock_updated', 'price_updated'], (event) => {
    if (idFromEventLink(event.link, 'product') !== id) return;
    setRefreshKey((k) => k + 1);
  });

  const prevRefreshKeyRef = useRef(refreshKey);
  useEffect(() => {
    let cancelled = false;
    const silent = prevRefreshKeyRef.current !== refreshKey;
    prevRefreshKeyRef.current = refreshKey;
    if (!silent) {
      setLoading(true);
      setLoadError(null);
    }
    api
      .product(id)
      .then((data) => {
        if (cancelled) return;
        setProduct(data.product);
        if (silent) {
          const floor = Math.max(data.product.moq, 1);
          const ceil = Math.max(data.product.stock, floor);
          const clamped = Math.min(qtyRef.current, ceil);
          if (clamped !== qtyRef.current) {
            setQty(clamped);
            setStockNotice(
              data.product.stock <= 0
                ? 'This listing just went out of stock.'
                : `Stock updated — only ${data.product.stock} left, so the quantity was reduced to ${clamped}.`,
            );
          } else {
            setStockNotice(null);
          }
        } else {
          setQty(Math.max(data.product.moq, 1));
        }
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
  }, [id, refreshKey]);

  // Market-sale box: real delivered orders in the last 30 days. On any
  // failure the box simply stays hidden — it must never show a guessed
  // or fake number. (Same rule as the old card popup.)
  useEffect(() => {
    if (!product) return;
    let cancelled = false;
    fetch(`${API_URL}/api/products/${product.id}/market-sale`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setMarketSale(data);
      })
      .catch(() => {
        if (!cancelled) setMarketSale(null);
      });
    return () => {
      cancelled = true;
    };
  }, [product]);

  // Group 1 — MOQ popup timer: cleared on unmount so a late timeout can
  // never set state on an unmounted component.
  useEffect(() => {
    return () => {
      if (moqTimerRef.current) window.clearTimeout(moqTimerRef.current);
    };
  }, []);

  // Group 1 — Related Products: same-category listings, first 6 excluding
  // this product. Fetched once per product (the silent Batch 13 refetch
  // re-sets `product` with a new object, so the ref guard stops a refetch
  // on every stock/price sync). Hidden while loading or when empty.
  useEffect(() => {
    if (!product || relatedForRef.current === product.id) return;
    relatedForRef.current = product.id;
    let cancelled = false;
    api
      .products({ category: product.category, limit: 8 })
      .then((data) => {
        if (cancelled) return;
        setRelatedProducts((data.products ?? []).filter((p) => p.id !== product.id).slice(0, 6));
      })
      .catch(() => {
        if (!cancelled) setRelatedProducts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [product]);

  // Group 1 — supplier profile: ONE fetch, shared by the Rating and
  // Reviews sections below (same data, no second call). On failure both
  // sections stay hidden — never a guessed rating or fake review.
  useEffect(() => {
    if (!product || supplierForRef.current === product.supplierId) return;
    supplierForRef.current = product.supplierId;
    let cancelled = false;
    api
      .publicSupplier(product.supplierId)
      .then((data) => {
        if (!cancelled) setSupplierProfile(data.supplier);
      })
      .catch(() => {
        if (!cancelled) setSupplierProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [product]);

  // Batch 16 — B8 GA4 product_view: once per product, when it loads.
  // The silent Batch 13 refetch re-sets `product` with a new object, so
  // the ref guard stops the same product firing twice.
  const viewedProductRef = useRef<string | null>(null);
  useEffect(() => {
    if (!product || viewedProductRef.current === product.id) return;
    viewedProductRef.current = product.id;
    trackProductView(product.id, product.category);
  }, [product]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="h-10 w-10 rounded-full border-4 border-slate-200 border-t-asan-accent animate-spin" />
      </div>
    );
  }

  // 'failed' must be checked BEFORE the not-found branch: on a load
  // failure product is still null, so `!product` would wrongly show
  // "Product not found" for a server/connection error.
  if (loadError === 'failed') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-slate-950 px-4 text-center">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Couldn&apos;t load this product</h1>
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

  if (loadError === 'not-found' || !product) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-slate-950 px-4 text-center">
        <Package className="w-12 h-12 text-slate-300 dark:text-slate-600" />
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Product not found</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          This listing may have been removed, or the link is wrong.
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

  const { pack, weight } = parsePack(product.unit);
  const stock = product.stock ?? 0;
  const outOfStock = stock <= 0 || product.status === 'Out of Stock';
  const canBuy = !authLoading && (!user || user.role === 'shopkeeper');
  const images = [product.image, ...(product.additionalImages ?? [])].filter(Boolean);

  const clampQty = (value: number) => {
    const floor = Math.max(product.moq, 1);
    const ceil = Math.max(stock, floor);
    return Math.min(Math.max(Math.floor(value) || floor, floor), ceil);
  };

  // Group 1 — MOQ popup: "Minimum order is {moq} {pack}s". Shows for 3s
  // only when Add to Cart is pressed with a quantity below the
  // supplier-decided MOQ (typing is free — see handleQtyInput).
  const showMoqPopup = () => {
    setMoqPopup(true);
    if (moqTimerRef.current) window.clearTimeout(moqTimerRef.current);
    moqTimerRef.current = window.setTimeout(() => setMoqPopup(false), 3000);
  };

  // Group 1 — qty input: free typing. The user can type any number
  // (e.g. 10) — no popup and no reset while typing, so an in-between
  // value (typing "1" on the way to "10") never snaps back to the MOQ.
  // The MOQ is checked only when Add to Cart is pressed (handleAdd).
  // An empty field is qty 0 and shows empty, ready for a fresh number.
  const handleQtyInput = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, '');
    if (digits === '') {
      setQty(0);
      return;
    }
    setQty(parseInt(digits, 10));
  };

  const handleAdd = () => {
    // Same guards as the marketplace card: guests are bounced to sign-in,
    // suppliers manage listings from their portal, only shopkeepers buy.
    if (authLoading) return;
    if (!user) {
      router.push(`/signin?redirect=/product/${product.id}`);
      return;
    }
    if (user.role !== 'shopkeeper') return;
    // Group 1 — MOQ is checked ONLY here (typing is free): below the
    // supplier-decided MOQ, show the popup, reset qty to the MOQ, and
    // do not add.
    const floor = Math.max(product.moq, 1);
    if (qty < floor) {
      showMoqPopup();
      setQty(floor);
      return;
    }
    // Free typing can exceed stock — never add more than is in stock.
    const finalQty = Math.min(qty, Math.max(stock, floor));
    if (finalQty !== qty) setQty(finalQty);
    addToCart(product, finalQty);
    // Batch 16 — B8 GA4: button is disabled when out of stock, so the
    // add always happened here (same guards as the card).
    trackAddToCart(product.id, finalQty);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1400);
  };

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

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Gallery — Group 1: constrained so the full image fits in one
              screen at 125% zoom. The monogram badge is the shrunken
              company-logo picture, a button to the supplier profile. */}
          <div className="max-w-md w-full">
            <Link
              href={`/suppliers/${product.supplierId}`}
              aria-label={`View ${product.supplierName} profile`}
              className="mb-3 inline-flex w-10 h-10 items-center justify-center rounded-full bg-asan-accent-light text-lg font-extrabold text-asan-accent hover:bg-asan-accent hover:text-white transition"
            >
              {product.supplierName.trim().charAt(0).toUpperCase()}
            </Link>
            <div className="relative w-full overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <ProductImage
                src={images[selectedImage] ?? product.image}
                alt={product.name}
                className="w-full aspect-square"
                imgClassName="object-contain"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                priority
              />
              {product.status === 'Low Stock' && (
                <div className="absolute top-3 right-3">
                  <Badge variant="warning">Low Stock</Badge>
                </div>
              )}
            </div>
            {/* Group 1: thumbnails for EVERY product, including single-image
                ones (one thumbnail) — Daraz-style strip below the image. */}
            {images.length >= 1 && (
              <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
                {images.map((src, i) => (
                  <button
                    key={`${src}-${i}`}
                    type="button"
                    onClick={() => setSelectedImage(i)}
                    aria-label={`View photo ${i + 1}`}
                    className={`shrink-0 w-20 h-20 overflow-hidden rounded-xl border-2 bg-white dark:bg-slate-900 transition ${
                      i === selectedImage
                        ? 'border-asan-accent'
                        : 'border-slate-200 dark:border-slate-800 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <ProductImage src={src} alt={`${product.name} photo ${i + 1}`} className="w-full h-full object-cover" width={80} height={80} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold text-asan-accent uppercase tracking-wider">{product.category}</p>
              <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white leading-tight">
                {product.name}
              </h1>
              <div className="mt-2 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                <Store className="w-4 h-4 text-slate-400" />
                {/* Group 1: the supplier NAME is the button to the supplier
                    profile. The ONLY visual change is the hover colour —
                    the site's light mint green (asan-accent, #53B175). */}
                <Link
                  href={`/suppliers/${product.supplierId}`}
                  className="font-medium text-slate-700 dark:text-slate-200 hover:text-asan-accent transition"
                >
                  {product.supplierName}
                </Link>
                <span>•</span>
                <span className="flex items-center gap-0.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  {product.supplierCity}
                </span>
              </div>
            </div>

            {product.description && (
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                {product.description}
              </p>
            )}

            {/* Group 1: smaller + fluid tiles — values never wrap
                (whitespace-nowrap + a fluid clamp font size). */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Price</p>
                <p className="text-[clamp(11px,0.9vw+4px,15px)] font-extrabold text-asan-dark dark:text-asan-accent-light mt-1 whitespace-nowrap">
                  {formatPKR(product.price)} / {pack}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Minimum order</p>
                <p className="text-[clamp(11px,0.9vw+4px,15px)] font-bold text-slate-900 dark:text-white mt-1 whitespace-nowrap">
                  {product.moq} {pack}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Pack size</p>
                <p className="text-[clamp(11px,0.9vw+4px,15px)] font-bold text-slate-900 dark:text-white mt-1 whitespace-nowrap">
                  {weight ? `1 ${pack} = ${weight}` : product.unit}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Stock</p>
                <p className="text-[clamp(11px,0.9vw+4px,15px)] font-bold text-slate-900 dark:text-white mt-1 whitespace-nowrap">
                  {stock} {pack}
                </p>
              </div>
            </div>

            {marketSale && marketSale.bagsSold > 0 && (
              <div className="rounded-xl border border-asan-border bg-asan-accent-light dark:border-asan-mid dark:bg-asan-dark/30 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Market sale — last 30 days
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                  {marketSale.bagsSold} {pack}
                  {marketSale.bagsSold === 1 ? '' : 's'} sold to {marketSale.shopkeepers} shopkeeper
                  {marketSale.shopkeepers === 1 ? '' : 's'}
                </p>
              </div>
            )}

            {/* MOQ / pack breakdown + Add to Cart */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
              {stockNotice && (
                <p className="text-xs font-bold text-amber-600 dark:text-amber-400">{stockNotice}</p>
              )}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="relative flex items-center gap-2">
                  {/* Group 1 — MOQ popup: small bubble above the stepper,
                      "Minimum order is {moq} {pack}s", hides after 3s. */}
                  {moqPopup && (
                    <div className="absolute -top-10 left-0 z-10 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-lg">
                      Minimum order is {Math.max(product.moq, 1)} {pack}
                      {Math.max(product.moq, 1) === 1 ? '' : 's'}
                    </div>
                  )}
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    disabled={outOfStock || qty <= Math.max(product.moq, 1)}
                    onClick={() => setQty((q) => clampQty(q - 1))}
                    className="w-10 h-10 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-40"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label="Quantity"
                    value={qty === 0 ? '' : qty}
                    disabled={outOfStock}
                    onChange={(e) => handleQtyInput(e.target.value)}
                    className="w-20 h-10 text-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-bold dark:text-white focus:outline-none"
                  />
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    disabled={outOfStock || qty >= stock}
                    onClick={() => setQty((q) => clampQty(q + 1))}
                    className="w-10 h-10 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-40"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{pack}</span>
                </div>

                <div className="sm:ml-auto">
                  {canBuy ? (
                    <button
                      type="button"
                      disabled={outOfStock}
                      onClick={handleAdd}
                      className={`flex items-center gap-1.5 px-5 py-2.5 min-h-[44px] rounded-xl text-sm font-bold shadow-md shadow-asan-accent-hover/20 transition ${
                        added ? 'bg-asan-accent text-white' : 'bg-asan-accent hover:bg-asan-accent-hover text-white'
                      } disabled:opacity-40`}
                    >
                      {added ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                      <span>{outOfStock ? 'Out of stock' : added ? 'Added to cart' : 'Add to Cart'}</span>
                    </button>
                  ) : (
                    <span className="text-xs font-medium text-slate-400">Only shopkeepers can purchase</span>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                <p className="flex justify-between">
                  <span>
                    {qty} {pack}
                    {qty === 1 ? '' : 's'} × {formatPKR(product.price)}
                  </span>
                  <span className="font-extrabold text-asan-dark dark:text-asan-accent-light">{formatPKR(product.price * qty)}</span>
                </p>
                {weight && (
                  <p className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>Weight</span>
                    <span>
                      {qty} {pack}
                      {qty === 1 ? '' : 's'} = {qty} × {weight}
                    </span>
                  </p>
                )}
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Minimum order is {product.moq} {pack}
                  {product.moq === 1 ? '' : 's'} ({formatPKR(product.price * Math.max(product.moq, 1))}).
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Group 1 — bottom sections, in this order: Related Products,
            Rating, Reviews. The Sold by card was REMOVED (preview feedback
            round 1): the supplier name button above already links to the
            supplier profile. */}

        {/* Related Products — same category, first 6 excluding this one.
            Hidden while loading or when empty: never fake products. */}
        {relatedProducts.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">Related Products</h2>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {relatedProducts.map((related) => (
                <ProductCard key={related.id} product={related} />
              ))}
            </div>
          </section>
        )}

        {/* Rating + Reviews — there are NO product-level ratings in this
            codebase; ratings live per-supplier on delivered orders, so
            both sections show THIS supplier's rating and reviews, fetched
            once (see the supplier profile effect above). The supplier's
            name is shown next to the rating. Both sections stay hidden
            if the profile fetch failed — never a guessed rating. */}
        {supplierProfile && (
          <>
            <section className="mt-10">
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">Rating</h2>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                {supplierProfile.rating.count === 0 ? (
                  <span className="text-base font-extrabold text-slate-900 dark:text-white">-</span>
                ) : (
                  <>
                    <span aria-label={`Rated ${supplierProfile.rating.average} out of 5`} className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <span
                          key={n}
                          className={n <= Math.round(supplierProfile.rating.average) ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600'}
                        >
                          ★
                        </span>
                      ))}
                    </span>
                    <span className="font-extrabold text-slate-900 dark:text-white">
                      {supplierProfile.rating.average}
                    </span>
                    <span>
                      ({supplierProfile.rating.count} review{supplierProfile.rating.count === 1 ? '' : 's'})
                    </span>
                  </>
                )}
                <span className="text-slate-400">•</span>
                <span>{supplierProfile.businessName}</span>
              </div>
            </section>

            <section className="mt-10">
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">Reviews</h2>
              {supplierProfile.reviews.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No reviews yet.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {[...supplierProfile.reviews]
                    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
                    .map((review, i) => (
                      <li
                        key={`${review.shopkeeperName}-${review.createdAt}-${i}`}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span aria-label={`${review.stars} out of 5 stars`} className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <span key={n} className={n <= review.stars ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600'}>
                                ★
                              </span>
                            ))}
                          </span>
                          <span className="text-sm font-bold text-slate-900 dark:text-white">{review.shopkeeperName}</span>
                          <span className="text-xs text-slate-400">
                            {new Date(review.createdAt).toLocaleDateString('en-PK', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                        </div>
                        {review.comment && (
                          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{review.comment}</p>
                        )}
                      </li>
                    ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
      <Footer />
    </div>
  );
}
