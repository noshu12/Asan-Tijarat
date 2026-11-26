"use client";

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Crosshair, MapPin, Minus, Plus, Check, Store, Package, Share2, ShoppingBag } from 'lucide-react';
import { api, API_URL, ApiError, type PublicSupplierProfile } from '@/lib/api';
import { Order, PaymentChannel, PaymentMethod, PAYMENT_METHOD_LABEL, Product } from '@/lib/types';
import { formatPKR } from '@/lib/utils';
import { ProductImage } from '@/components/ProductImage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader } from '@/components/ui/loader';
import { Modal } from '@/components/ui/modal';
import { Footer } from '@/components/Footer';
import { useAuth } from '@/context/AuthProvider';
import { addToCart } from '@/lib/cart';
import { useDeviceLocation } from '@/lib/useDeviceLocation';
import { trackAddToCart, trackCheckoutStart, trackOrderPlaced, trackProductView } from '@/lib/analytics';
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
 * Layout (2026-11-27, Noushad's reference: a Tokopedia-style product
 * page) — 3 columns on desktop: gallery left, details middle, sticky
 * buy box right. Mapping to Asan Tijarat, nothing invented: the
 * reference's size selector (S/M/L/XL) does not exist here, so the buy
 * box has the pack / MOQ / stock / quantity stepper instead; there are
 * no discounts, so there is no % OFF badge; "Sold" is the real
 * market-sale count (last 30 days) when it exists; "Buy Now" buys
 * right here — it opens the same Confirm Wholesale Order popup the
 * cart uses (address + shop location + payment), and Place Order
 * creates the order for ONLY this product + quantity. The page never
 * navigates away; the cart is never touched. Add to Cart is the one
 * that goes to the cart. "Chat Seller" is NOT here — there is no
 * messages page for shopkeepers yet (only admin/messages), so there
 * is nothing real to link it to.
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
  // Tokopedia-style layout — middle-column tabs and Share button state.
  const [tab, setTab] = useState<'about' | 'reviews'>('about');
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);
  // Buy Now checkout (same Confirm Wholesale Order popup as the cart):
  // address + shop location + payment, then Place Order for ONLY this
  // product + the quantity picked here. buyQty is frozen when the popup
  // opens so the order can never drift from what was shown.
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [shippingAddress, setShippingAddress] = useState('');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [createdOrders, setCreatedOrders] = useState<Order[] | null>(null);
  const [buyQty, setBuyQty] = useState(0);
  // Batch 05 — payment choice (2 methods only; COD was dropped). The
  // shopkeeper pays through their OWN bank/JazzCash/Raast app — no money
  // moves through an API; the reference is submitted from My Orders.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('online_advance');
  const [paymentChannel, setPaymentChannel] = useState<PaymentChannel>('bank');
  const {
    coords,
    locating,
    notice: locationNotice,
    capture: captureLocation,
    autoPrompt: autoPromptLocation,
  } = useDeviceLocation();
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
      if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
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

  // Shared guards for Add to Bag / Buy Now: guests are bounced to
  // sign-in, suppliers manage listings from their portal, only
  // shopkeepers buy. Returns the final quantity to add, or null when
  // nothing should be added (MOQ popup shown, or not a shopkeeper).
  const resolveQty = (): number | null => {
    if (authLoading) return null;
    if (!user) {
      router.push(`/signin?redirect=/product/${product.id}`);
      return null;
    }
    if (user.role !== 'shopkeeper') return null;
    // Group 1 — MOQ is checked ONLY here (typing is free): below the
    // supplier-decided MOQ, show the popup, reset qty to the MOQ, and
    // do not add.
    const floor = Math.max(product.moq, 1);
    if (qty < floor) {
      showMoqPopup();
      setQty(floor);
      return null;
    }
    // Free typing can exceed stock — never add more than is in stock.
    const finalQty = Math.min(qty, Math.max(stock, floor));
    if (finalQty !== qty) setQty(finalQty);
    return finalQty;
  };

  const handleAdd = () => {
    const finalQty = resolveQty();
    if (finalQty === null) return;
    addToCart(product, finalQty);
    // Batch 16 — B8 GA4: button is disabled when out of stock, so the
    // add always happened here (same guards as the card).
    trackAddToCart(product.id, finalQty);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1400);
  };

  // Buy Now (2026-11-27, corrected): like every website — the product
  // is bought RIGHT HERE. No navigation, no cart: the Confirm Wholesale
  // Order popup opens on this page (same popup as the cart), and Place
  // Order creates the order for ONLY this product + the picked quantity.
  // The order then goes to My Orders, the supplier's orders and
  // notifications, exactly like a cart checkout.
  const handleBuyNow = () => {
    const finalQty = resolveQty();
    if (finalQty === null) return;
    setBuyQty(finalQty);
    setCheckoutError(null);
    // Batch 16 — B8 GA4: checkout modal opens = order placement starts.
    trackCheckoutStart();
    setCheckoutOpen(true);
    autoPromptLocation();
  };

  const handleCheckout = async () => {
    if (!user || buyQty <= 0) return;
    if (!shippingAddress.trim()) { setCheckoutError('Shipping address is required.'); return; }
    setCheckoutError(null);
    setCheckoutLoading(true);
    try {
      const location = coords ?? user?.currentLocation ?? undefined;
      const res = await api.createOrder({
        items: [{ productId: product.id, quantity: buyQty }],
        shippingAddress: shippingAddress.trim(),
        currentLocation: location ? { lat: location.lat, lng: location.lng } : undefined,
        paymentMethod,
        paymentChannel,
      });
      // Batch 16 — B8 GA4: one order per supplier, so one event per
      // order — order id + total amount only, no PII.
      res.orders.forEach((o) => trackOrderPlaced(o.id, o.totalAmount));
      setCreatedOrders(res.orders);
      setCheckoutOpen(false);
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Checkout failed. Please try again.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API unavailable (older browser / no permission) —
      // fall back to the classic select + copy.
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    setCopied(true);
    if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-950 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        {/* Breadcrumb — Home / Marketplace / Category / product name.
            Category is plain text (not a link): the marketplace filter
            needs a slug, and guessing one here could open an empty list. */}
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
          <Link href="/" className="hover:text-asan-accent transition">Home</Link>
          <ChevronRight className="w-4 h-4 text-slate-300" />
          <Link href="/marketplace" className="hover:text-asan-accent transition">Marketplace</Link>
          <ChevronRight className="w-4 h-4 text-slate-300" />
          <span>{product.category}</span>
          <ChevronRight className="w-4 h-4 text-slate-300" />
          <span className="font-medium text-slate-900 dark:text-white truncate max-w-[220px] sm:max-w-sm">{product.name}</span>
        </nav>

        {/* Buy Now success — shown after Place Order in the popup:
            order numbers + View My Orders, same as the cart page. */}
        {createdOrders && createdOrders.length > 0 && (
          <div className="mt-4 p-6 rounded-3xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 shadow-sm">
            <div className="flex items-center gap-3">
              <Check className="w-6 h-6 text-emerald-600 shrink-0" />
              <div>
                <h3 className="text-base font-bold text-emerald-800 dark:text-emerald-300">
                  Order placed successfully! 🎉
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  {createdOrders.length} order{createdOrders.length > 1 ? 's' : ''} saved to MongoDB —{' '}
                  {createdOrders.map((o) => o.orderNumber).join(', ')} · total {formatPKR(createdOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0))}.
                  The supplier will confirm, ship and deliver your lot
                  {createdOrders.some((o) => o.buyerLocationLink)
                    ? ' using the shop location link shared with your order.'
                    : '.'}{' '}
                  {createdOrders[0]?.paymentMethod === 'online_advance'
                    ? 'Pay via your bank/JazzCash/Raast app, then submit the transaction reference from My Orders — the money stays in escrow until delivery.'
                    : 'You will pay online when the goods arrive at delivery.'}
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Link
                href="/shopkeeper/orders"
                className="px-4 py-2 rounded-xl bg-asan-accent hover:bg-asan-accent-hover text-white text-xs font-bold shadow transition"
              >
                View My Orders
              </Link>
              <button
                type="button"
                onClick={() => setCreatedOrders(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition"
              >
                Keep Browsing
              </button>
            </div>
          </div>
        )}

        {/* Tokopedia-style 3 columns on desktop: gallery | details |
            sticky buy box. Stacked on mobile in the same order. */}
        <div className="mt-3 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Gallery — image + Daraz-style thumbnails below. No monogram
              badge — the supplier NAME in the details column is the link
              to the supplier profile. Image is 4:3 (not square) so the
              main image + thumbnails below fit in one screen together
              (2026-11-27: Ustad asked to shrink it a bit for exactly
              this). Do NOT shrink it further without his say-so. */}
          <div className="lg:col-span-5">
            <div className="relative w-full overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <ProductImage
                src={images[selectedImage] ?? product.image}
                alt={product.name}
                className="w-full aspect-[4/3]"
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
                    className={`shrink-0 w-16 h-16 overflow-hidden rounded-xl border-2 bg-white dark:bg-slate-900 transition ${
                      i === selectedImage
                        ? 'border-asan-accent'
                        : 'border-slate-200 dark:border-slate-800 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <ProductImage src={src} alt={`${product.name} photo ${i + 1}`} className="w-full h-full object-cover" width={64} height={64} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details — title, supplier, rating, then About / Reviews tabs */}
          <div className="lg:col-span-4 space-y-4">
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
              {/* Rating row — the SUPPLIER's rating (no product-level
                  ratings exist). "Sold" is the real market-sale count
                  from the last 30 days, shown only when it exists. */}
              {supplierProfile && supplierProfile.rating.count > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                  <span aria-label={`Rated ${supplierProfile.rating.average} out of 5`} className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span key={n} className={n <= Math.round(supplierProfile.rating.average) ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600'}>
                        ★
                      </span>
                    ))}
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white">{supplierProfile.rating.average}</span>
                  <span>
                    ({supplierProfile.rating.count} review{supplierProfile.rating.count === 1 ? '' : 's'})
                  </span>
                  {marketSale && marketSale.bagsSold > 0 && (
                    <>
                      <span>•</span>
                      <span>{marketSale.bagsSold} sold in last 30 days</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Tabs — About Item / Reviews (reference layout). Reviews are
                the supplier's reviews; the old bottom Reviews section is
                gone so they are not shown twice. */}
            <div className="flex gap-6 border-b border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setTab('about')}
                className={`pb-2 text-sm font-bold transition ${tab === 'about' ? 'text-asan-accent border-b-2 border-asan-accent -mb-px' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
              >
                About Item
              </button>
              <button
                type="button"
                onClick={() => setTab('reviews')}
                className={`pb-2 text-sm font-bold transition ${tab === 'reviews' ? 'text-asan-accent border-b-2 border-asan-accent -mb-px' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
              >
                Reviews
              </button>
            </div>

            {tab === 'about' ? (
              <div className="space-y-4">
                {product.description && (
                  <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                    {product.description}
                  </p>
                )}
                <dl className="text-sm">
                  <div className="flex justify-between gap-4 py-2 border-b border-slate-100 dark:border-slate-800">
                    <dt className="text-slate-500 dark:text-slate-400">Category</dt>
                    <dd className="font-medium text-slate-900 dark:text-white text-right">{product.category}</dd>
                  </div>
                  <div className="flex justify-between gap-4 py-2 border-b border-slate-100 dark:border-slate-800">
                    <dt className="text-slate-500 dark:text-slate-400">Supplier</dt>
                    <dd className="font-medium text-right">
                      <Link href={`/suppliers/${product.supplierId}`} className="text-asan-accent hover:underline">
                        {product.supplierName}
                      </Link>
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 py-2 border-b border-slate-100 dark:border-slate-800">
                    <dt className="text-slate-500 dark:text-slate-400">Pack size</dt>
                    <dd className="font-medium text-slate-900 dark:text-white text-right">{weight ? `1 ${pack} = ${weight}` : product.unit}</dd>
                  </div>
                  <div className="flex justify-between gap-4 py-2 border-b border-slate-100 dark:border-slate-800">
                    <dt className="text-slate-500 dark:text-slate-400">Minimum order</dt>
                    <dd className="font-medium text-slate-900 dark:text-white text-right">{product.moq} {pack}{product.moq === 1 ? '' : 's'}</dd>
                  </div>
                  <div className="flex justify-between gap-4 py-2 border-b border-slate-100 dark:border-slate-800">
                    <dt className="text-slate-500 dark:text-slate-400">Stock</dt>
                    <dd className="font-medium text-slate-900 dark:text-white text-right">{outOfStock ? 'Out of stock' : `${stock} ${pack}${stock === 1 ? '' : 's'}`}</dd>
                  </div>
                  <div className="flex justify-between gap-4 py-2">
                    <dt className="text-slate-500 dark:text-slate-400">City</dt>
                    <dd className="font-medium text-slate-900 dark:text-white text-right">{product.supplierCity}</dd>
                  </div>
                </dl>
              </div>
            ) : (
              <div>
                {!supplierProfile ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">Loading reviews…</p>
                ) : supplierProfile.reviews.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">No reviews yet.</p>
                ) : (
                  <ul className="space-y-3">
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
              </div>
            )}
          </div>

          {/* Buy box — sticky on desktop (reference layout). No sizes
              and no discount badge here: pack / MOQ / stock / quantity
              instead. Buy Now = the checkout popup opens right here
              (cart untouched, no navigation). */}
          <div className="lg:col-span-3">
            <div className="lg:sticky lg:top-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4 shadow-sm">
              {stockNotice && (
                <p className="text-xs font-bold text-amber-600 dark:text-amber-400">{stockNotice}</p>
              )}

              <div className="flex items-start justify-between gap-2">
                <p className="text-2xl font-extrabold text-slate-900 dark:text-white">
                  {formatPKR(product.price)}
                  <span className="text-sm font-bold text-slate-500 dark:text-slate-400"> / {pack}</span>
                </p>
                <span className="shrink-0 rounded-full bg-asan-accent-light px-2.5 py-1 text-xs font-bold text-asan-dark">
                  MOQ {product.moq} {pack}{product.moq === 1 ? '' : 's'}
                </span>
              </div>

              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">Set Order</p>
                <div className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                  <p className="flex justify-between gap-4">
                    <span>Pack</span>
                    <span className="font-medium text-slate-900 dark:text-white text-right">{weight ? `1 ${pack} = ${weight}` : product.unit}</span>
                  </p>
                  <p className="flex justify-between gap-4">
                    <span>Stock</span>
                    <span className="font-medium text-slate-900 dark:text-white text-right">{outOfStock ? 'Out of stock' : `${stock} ${pack}${stock === 1 ? '' : 's'}`}</span>
                  </p>
                  <p className="flex justify-between gap-4">
                    <span>Minimum order</span>
                    <span className="font-medium text-slate-900 dark:text-white text-right">{product.moq} {pack}{product.moq === 1 ? '' : 's'}</span>
                  </p>
                </div>
              </div>

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

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1">
                <p className="flex justify-between items-center">
                  <span className="text-sm text-slate-500 dark:text-slate-400">Total Price</span>
                  <span className="text-xl font-extrabold text-slate-900 dark:text-white">{formatPKR(product.price * qty)}</span>
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {qty} {pack}{qty === 1 ? '' : 's'} × {formatPKR(product.price)}
                  {weight ? ` — ${qty} ${pack}${qty === 1 ? '' : 's'} = ${qty} × ${weight}` : ''}
                </p>
              </div>

              {canBuy ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={outOfStock}
                    onClick={handleBuyNow}
                    className="w-full min-h-[44px] rounded-xl bg-asan-accent hover:bg-asan-accent-hover text-white text-sm font-bold shadow-md shadow-asan-accent-hover/20 transition disabled:opacity-40"
                  >
                    {outOfStock ? 'Out of stock' : 'Buy Now'}
                  </button>
                  <button
                    type="button"
                    disabled={outOfStock}
                    onClick={handleAdd}
                    className={`w-full min-h-[44px] rounded-xl border-2 border-asan-accent text-asan-accent text-sm font-bold transition disabled:opacity-40 flex items-center justify-center gap-1.5 ${
                      added ? 'bg-asan-accent-light' : 'bg-white hover:bg-asan-accent-light dark:bg-slate-900'
                    }`}
                  >
                    {added ? <Check className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
                    <span>{added ? 'Added to Bag' : 'Add to Bag'}</span>
                  </button>
                </div>
              ) : (
                <p className="text-xs font-medium text-slate-400 text-center">Only shopkeepers can purchase</p>
              )}

              <button
                type="button"
                onClick={handleShare}
                className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-medium text-slate-500 hover:text-asan-accent transition"
              >
                <Share2 className="w-4 h-4" />
                <span>{copied ? 'Link copied' : 'Share Product'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Bottom sections, in this order: Related Products, Rating.
            Reviews live in the middle-column tab now. The Sold by card
            was REMOVED (preview feedback round 1): the supplier name
            button above already links to the supplier profile. */}

        {/* Related Products — same category, first 6 excluding this one.
            Hidden while loading or when empty: never fake products. */}
        {relatedProducts.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">Related Products</h2>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {relatedProducts.map((related) => (
                <ProductCard key={related.id} product={related} />
              ))}
            </div>
          </section>
        )}

        {/* Rating — there are NO product-level ratings in this codebase;
            ratings live per-supplier on delivered orders, so this section
            shows THIS supplier's rating, fetched once (see the supplier
            profile effect above). Reviews live in the middle-column tab
            now, not here. The section stays hidden if the profile fetch
            failed — never a guessed rating. */}
        {supplierProfile && (
          <>
            <section className="mt-8">
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

          </>
        )}
      </div>
      <Footer />

      {/* Buy Now checkout — the SAME Confirm Wholesale Order popup as
          the cart page, opened right here on the product page. No
          navigation: Place Order creates the order for only this
          product + buyQty, then the success box above shows it. */}
      <Modal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        title="Confirm Wholesale Order"
        description="Your order is placed against live stock in MongoDB — quantities below MOQ will be rejected."
      >
        <form
          onSubmit={(e) => { e.preventDefault(); void handleCheckout(); }}
          className="space-y-4"
        >
          {checkoutError && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">⚠️ {checkoutError}</p>
          )}
          <Input
            label="Shipping Address"
            value={shippingAddress}
            onChange={(e) => setShippingAddress(e.target.value)}
            placeholder="Shop / warehouse address"
            required
          />
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-asan-accent" />
              Shop Location (for delivery)
            </p>
            {locating && (
              <p className="text-xs text-slate-500 flex items-center gap-2">
                <Loader /> Detecting your current location…
              </p>
            )}
            {coords && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-slate-600 dark:text-slate-300 font-mono">
                  📍 {coords.lat}, {coords.lng}
                </p>
                <a
                  href={`https://www.google.com/maps?q=${coords.lat},${coords.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-bold text-asan-accent dark:text-asan-accent-light hover:underline"
                >
                  <MapPin className="w-3 h-3" />
                  Preview in Google Maps
                </a>
              </div>
            )}
            {locationNotice && (
              <p className="text-xs text-amber-600 dark:text-amber-400">{locationNotice}</p>
            )}
            {!coords && !locating && !locationNotice && (
              <p className="text-xs text-slate-400">
                {user?.currentLocation
                  ? `Your saved location (${user?.currentLocation.lat}, ${user?.currentLocation.lng}) will be shared. Capture a fresh point to update it.`
                  : 'Capture your live location so the supplier receives a Google Maps link to your shop for delivery.'}
              </p>
            )}
            <button
              type="button"
              onClick={captureLocation}
              disabled={locating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-asan-dark hover:bg-asan-mid disabled:opacity-60 text-white text-xs font-bold transition"
            >
              <Crosshair className="w-3 h-3" />
              {coords ? 'Recapture my current location' : 'Use my current location'}
            </button>
            {!coords && !user?.currentLocation && !locating && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                ⚠ No location available — the supplier will only see the written shipping address.
              </p>
            )}
          </div>
          {/* Batch 05 — payment method + channel. No money moves here: the
              shopkeeper pays through their own bank/JazzCash/Raast app and
              submits the reference from My Orders afterwards. */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Payment Method
            </p>
            <label className="flex items-start gap-2 text-xs cursor-pointer">
              <input
                type="radio"
                name="paymentMethod"
                checked={paymentMethod === 'online_advance'}
                onChange={() => setPaymentMethod('online_advance')}
                className="mt-0.5 accent-asan-accent"
              />
              <span>
                {/* Batch 06 — shared label (audit finding 9): same text as the order detail page. */}
                <span className="font-bold text-slate-900 dark:text-white">{PAYMENT_METHOD_LABEL.online_advance}</span>
                <span className="block text-xs text-slate-500">Money is held in escrow and releases to the supplier once delivery is confirmed.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs cursor-pointer">
              <input
                type="radio"
                name="paymentMethod"
                checked={paymentMethod === 'online_at_delivery'}
                onChange={() => setPaymentMethod('online_at_delivery')}
                className="mt-0.5 accent-asan-accent"
              />
              <span>
                <span className="font-bold text-slate-900 dark:text-white">Pay online at delivery</span>
                <span className="block text-xs text-slate-500">Check the goods first, then pay online when they arrive.</span>
              </span>
            </label>
            <label className="block text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Pay through</span>
              <select
                value={paymentChannel}
                onChange={(e) => setPaymentChannel(e.target.value as PaymentChannel)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs dark:bg-slate-900 dark:border-slate-700 dark:text-white focus:outline-none"
              >
                <option value="bank">Bank transfer</option>
                <option value="raast">Raast (instant, free)</option>
                <option value="jazzcash">JazzCash</option>
              </select>
            </label>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3 text-xs space-y-1">
            <div className="flex justify-between text-slate-500">
              <span>1 item · {buyQty} {pack}{buyQty === 1 ? '' : 's'} × {formatPKR(product.price)}</span>
              <span className="font-bold text-slate-900 dark:text-white">{formatPKR(product.price * buyQty)}</span>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Button type="button" variant="outline" onClick={() => setCheckoutOpen(false)}>Cancel</Button>
            <Button type="submit" isLoading={checkoutLoading}>Place Order</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
