"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ProductCard } from '@/components/ProductCard';
import { ProductImage } from '@/components/ProductImage';
import { Footer } from '@/components/Footer';
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Package,
  Scale,
  ShieldCheck,
  Store,
  Tag,
  Truck,
  Building2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Product } from '@/lib/types';

// Marketplace filter slugs for the category names that come back from
// GET /api/products. Unknown categories link to the full marketplace
// instead of a filter that would return nothing.
const CATEGORY_SLUG: Record<string, string> = {
  'Staples, Grains & Flours': 'staples-grains-flours',
  'Pulses, Lentils & Beans': 'pulses-lentils-beans',
  'Cooking Oils, Ghee & Fats': 'cooking-oils-ghee-fats',
  'Spices, Herbs & Baking': 'spices-herbs-baking',
  'Packaged Foods, Recipe Mixes & Sauces': 'packaged-foods-recipe-mixes-sauces',
  'Beverages & Cold Corner': 'beverages-cold-corner',
  'Tea, Coffee & Dairy': 'tea-coffee-dairy',
  'Snacks, Biscuits & Confectionery': 'snacks-biscuits-confectionery',
  'Instant & Ready-to-Cook Foods': 'instant-ready-to-cook-foods',
  'Home Cleaning & Sanitation': 'home-cleaning-sanitation',
  'Personal Care & Hygiene': 'personal-care-hygiene',
  'Mother & Baby Care': 'mother-baby-care',
  'Paper Products, Wraps & Utilities': 'paper-products-wraps-utilities',
  'Over-the-Counter Healthcare': 'over-the-counter-healthcare',
};

// Pixels of pointer movement that count as a drag (not a tap/click) on
// the trending carousel. Below this, a tap still navigates to the
// product detail page; above it, the click is suppressed.
const CAROUSEL_DRAG_THRESHOLD_PX = 6;

export default function HomeClient() {
  // Real catalogue from GET /api/products. On backend failure this stays
  // empty on purpose — no mock fallback, so no fake products ever show here.
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Batch 19 (Round-5 audit L10) — categories + catalogue stats come
  // from the lightweight GET /api/products/categories endpoint (three
  // server-side distinct/count calls, no product documents), NOT from
  // the product page: the homepage used to fetch 100 products just to
  // derive these, and the stats were only as accurate as the first 100
  // rows. Null until the endpoint answers; the memos below fall back to
  // deriving from the 48 loaded products if it fails.
  const [categoryList, setCategoryList] = useState<string[] | null>(null);
  const [totalProducts, setTotalProducts] = useState<number | null>(null);
  const [supplierCount, setSupplierCount] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        // 48 products: 8 for the trending carousel + a sample to derive
        // the per-category thumbnail images (up to 4 real photos per
        // category). Categories/stats still ride separately on
        // api.productCategories(), so the stats stay exact, not sample-based.
        const [data, cats] = await Promise.all([
          api.products({ limit: 48 }),
          api.productCategories().catch(() => null),
        ]);
        setProducts(data.products);
        if (cats) {
          setCategoryList(cats.categories ?? []);
          setTotalProducts(typeof cats.total === 'number' ? cats.total : null);
          setSupplierCount(typeof cats.suppliers === 'number' ? cats.suppliers : null);
        }
      } catch {
        setProducts([]);
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, []);

  // First 8 products, same source/order as the old static grid. There is
  // no sales-ranking endpoint, so "top-selling" cannot be ranked by sales
  // yet — the carousel shows the same top products the grid showed.
  const topProducts = useMemo(() => products.slice(0, 8), [products]);

  const categories = useMemo(() => {
    if (categoryList !== null) return categoryList;
    const seen = new Set<string>();
    const list: string[] = [];
    for (const product of products) {
      if (product.category && !seen.has(product.category)) {
        seen.add(product.category);
        list.push(product.category);
      }
    }
    return list;
  }, [products, categoryList]);

  // Category cards for "Browse Top Categories", derived from the real
  // 48-product sample: up to 4 real product photos per category (one
  // photo per product), ordered by product count in the sample,
  // descending. Only categories with at least 1 product photo in the
  // sample are shown. Counts here are sample counts, used for ordering
  // only — the stats banner still uses api.productCategories().
  const categoryCards = useMemo(() => {
    const byCategory = new Map<string, { images: string[]; count: number }>();
    for (const product of products) {
      if (!product.category) continue;
      const entry = byCategory.get(product.category) ?? { images: [], count: 0 };
      entry.count += 1;
      if (entry.images.length < 4 && product.image) entry.images.push(product.image);
      byCategory.set(product.category, entry);
    }
    return [...byCategory.entries()]
      .filter(([, entry]) => entry.images.length >= 1)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([name, entry]) => ({ name, images: entry.images }));
  }, [products]);

  const suppliers = useMemo(() => {
    if (supplierCount !== null) return supplierCount;
    const seen = new Set<string>();
    for (const product of products) {
      if (product.supplierName) seen.add(product.supplierName);
    }
    return seen.size;
  }, [products, supplierCount]);

  // --- Trending carousel: auto-scroll + mouse drag + touch swipe ---
  // The list is rendered twice so the auto-scroll can loop seamlessly:
  // when scrollLeft reaches the end of the first copy, it jumps back by
  // exactly one copy's width, which looks identical. Auto-scroll pauses
  // on hover, while the pointer is down, and while dragging; touch
  // swiping works through the native horizontal scroll (touch-action is
  // left to the browser's pan-x). Tapping a card still navigates to its
  // detail page via ProductCard's own links — only a real drag (pointer
  // moved past CAROUSEL_DRAG_THRESHOLD_PX) suppresses the click, via
  // onClickCapture, so dragging never navigates or adds to cart.
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const carouselPausedRef = useRef(false);
  const carouselDraggingRef = useRef(false);
  const carouselDragStartXRef = useRef(0);
  const carouselDragStartScrollRef = useRef(0);
  const carouselDragMovedRef = useRef(false);
  const carouselSuppressClickRef = useRef(false);

  useEffect(() => {
    if (topProducts.length === 0) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const el = carouselRef.current;
      if (el && !carouselPausedRef.current && !carouselDraggingRef.current) {
        // Only scroll when the content overflows; with very few products
        // there is nothing to loop through.
        if (el.scrollWidth > el.clientWidth + 4) {
          el.scrollLeft += (now - last) * 0.035;
          const half = el.scrollWidth / 2;
          if (half > 0 && el.scrollLeft >= half) {
            el.scrollLeft -= half;
          }
        }
      }
      last = now;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [topProducts.length]);

  const handleCarouselPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Mouse only — touch uses the native horizontal scroll instead.
    if (e.pointerType !== 'mouse') return;
    carouselDraggingRef.current = true;
    carouselDragMovedRef.current = false;
    carouselDragStartXRef.current = e.clientX;
    carouselDragStartScrollRef.current = carouselRef.current?.scrollLeft ?? 0;
    carouselPausedRef.current = true;
  };

  const handleCarouselPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!carouselDraggingRef.current || e.pointerType !== 'mouse') return;
    const dx = e.clientX - carouselDragStartXRef.current;
    if (Math.abs(dx) > CAROUSEL_DRAG_THRESHOLD_PX) carouselDragMovedRef.current = true;
    const el = carouselRef.current;
    if (el) el.scrollLeft = carouselDragStartScrollRef.current - dx;
  };

  const handleCarouselPointerEnd = () => {
    if (!carouselDraggingRef.current) return;
    carouselDraggingRef.current = false;
    carouselPausedRef.current = false;
    if (carouselDragMovedRef.current) {
      carouselSuppressClickRef.current = true;
      window.setTimeout(() => {
        carouselSuppressClickRef.current = false;
      }, 100);
    }
  };

  const handleCarouselClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (carouselSuppressClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      
      {/* 1. HERO SECTION — same as the laptop screen in the promo video:
          photo background (Frontend/public/hero-bg.jpg) with a dark
          overlay, white heading left-aligned, Supplier green filled +
          Shopkeeper outline buttons. If hero-bg.jpg is missing the
          section falls back to a dark background — put the photo in
          Frontend/public/hero-bg.jpg. */}
      <section className="relative bg-slate-900 text-white pt-20 pb-24 overflow-hidden">
        <Image
          src="/hero-bg.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover pointer-events-none"
        />
        <div className="absolute inset-0 bg-slate-900/55 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/60 via-slate-900/20 to-transparent pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-left">

            {/* Headline */}
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight max-w-2xl leading-[1.1]">
              Wholesale Trade, <br />
              Made Simple
            </h1>

            {/* Subtext — true claims only */}
            <p className="mt-6 text-base sm:text-xl text-white/85 max-w-2xl leading-relaxed">
              Connect suppliers and shopkeepers across Pakistan. Separate portals, bulk orders with minimum order quantity, and price per pack, clearly shown — all in one place.
            </p>

            {/* CTAs */}
            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <Link
                href="/signin"
                className="group inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-asan-accent hover:bg-asan-accent-hover text-white text-sm font-bold shadow-lg shadow-asan-accent/30 transition"
              >
                <Building2 className="w-4 h-4" />
                <span>I&apos;m a Supplier</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>

              <Link
                href="/marketplace"
                className="group inline-flex items-center gap-2 px-8 py-4 rounded-xl border border-white/70 bg-white/10 hover:bg-white/20 text-white text-sm font-bold shadow-lg transition"
              >
                <Store className="w-4 h-4" />
                <span>I&apos;m a Shopkeeper</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
        </div>
      </section>

      {/* 2. STATS BANNER — real counts from listed products only */}
      <section className="bg-white border-y border-asan-border text-asan-dark py-5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl sm:text-3xl font-extrabold text-asan-accent">{isLoading ? '…' : (totalProducts ?? products.length)}</p>
            <p className="text-xs sm:text-sm text-asan-text-light uppercase tracking-wider font-semibold mt-1">Products Listed</p>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-extrabold text-asan-accent">{isLoading ? '…' : categories.length}</p>
            <p className="text-xs sm:text-sm text-asan-text-light uppercase tracking-wider font-semibold mt-1">Categories</p>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-extrabold text-asan-accent">{isLoading ? '…' : suppliers}</p>
            <p className="text-xs sm:text-sm text-asan-text-light uppercase tracking-wider font-semibold mt-1">Suppliers</p>
          </div>
        </div>
      </section>

      {/* 3. TOP PRODUCTS — real products only, horizontal auto-moving carousel */}
      <section className="py-16 bg-slate-50 dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center mb-6">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-asan-dark dark:text-white">
            Trending Wholesale Commodities
          </h2>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {isLoading ? (
            <p className="text-center text-sm text-slate-500">Loading products…</p>
          ) : topProducts.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">No products yet</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No products have been listed yet. Once suppliers add real products, they will appear here.
              </p>
            </div>
          ) : (
            <div
              ref={carouselRef}
              role="region"
              aria-label="Trending wholesale commodities"
              onMouseEnter={() => {
                carouselPausedRef.current = true;
              }}
              onMouseLeave={() => {
                carouselPausedRef.current = false;
              }}
              onPointerDown={handleCarouselPointerDown}
              onPointerMove={handleCarouselPointerMove}
              onPointerUp={handleCarouselPointerEnd}
              onPointerCancel={handleCarouselPointerEnd}
              onClickCapture={handleCarouselClickCapture}
              className="flex gap-4 overflow-x-auto pb-2 select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&_img]:pointer-events-none"
            >
              {[...topProducts, ...topProducts].map((product, index) => (
                <div
                  key={`${product.id}-${index}`}
                  className="w-[170px] shrink-0 sm:w-[220px] lg:w-[240px]"
                >
                  <ProductCard product={product} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 4. TOP CATEGORIES — categories from real products only */}
      <section className="py-20 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-asan-dark dark:text-white">
              Browse Top Categories
            </h2>
          </div>

          {isLoading ? (
            <p className="text-center text-sm text-slate-500">Loading categories…</p>
          ) : categoryCards.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">No categories yet</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No categories to show yet. Once real products are listed, their categories will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {categoryCards.map(({ name, images }) => {
                const slug = CATEGORY_SLUG[name];
                const href = slug ? `/marketplace?cat=${slug}` : '/marketplace';
                return (
                  <Link
                    key={name}
                    href={href}
                    className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-xl transition-all p-3 text-center"
                  >
                    <div className={images.length === 1 ? 'grid grid-cols-1 gap-1' : 'grid grid-cols-2 gap-1'}>
                      {images.map((src, i) => (
                        <ProductImage
                          key={i}
                          src={src}
                          alt={name}
                          fill
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 12vw"
                          className="h-16 w-full rounded-lg sm:h-20"
                          imgClassName="object-cover"
                        />
                      ))}
                    </div>
                    <p className="mt-2 font-bold text-xs sm:text-sm leading-tight group-hover:text-asan-accent transition">
                      {name}
                    </p>
                  </Link>
                );
              })}
            </div>
          )}

          <div className="mt-10 text-center">
            <Link
              href="/marketplace"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-asan-accent hover:bg-asan-accent-hover text-white text-sm font-bold shadow-md shadow-asan-accent-hover/20 transition"
            >
              <span>View All Products</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* 5. FEATURES — what the platform offers (all true, already live) */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-asan-dark">
              Why Asan Tijarat?
            </h2>
            <p className="mt-3 text-sm sm:text-base text-asan-text-light">
              Everything a supplier and a shopkeeper need — in one place.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                icon: Package,
                title: 'Bulk Orders with MOQ',
                desc: 'Order in bulk with a minimum order quantity set by the supplier.',
              },
              {
                icon: ShieldCheck,
                title: 'Escrow Payments',
                desc: 'Your payment stays safe in escrow until the delivery is confirmed.',
              },
              {
                icon: Tag,
                title: 'Clear Price Per Pack',
                desc: 'The price per pack is shown upfront — no hidden rates.',
              },
              {
                icon: BadgeCheck,
                title: 'Verified Suppliers',
                desc: 'Suppliers are verified before they can sell on the marketplace.',
              },
              {
                icon: Truck,
                title: 'Order Tracking',
                desc: 'Track every order from confirmation to delivery, in My Orders.',
              },
              {
                icon: Scale,
                title: 'Dispute Support',
                desc: '15 clear dispute reasons, with the admin deciding fairly.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-slate-200/80 bg-slate-50 p-5"
              >
                <div className="w-11 h-11 rounded-xl bg-asan-accent-light flex items-center justify-center text-asan-accent">
                  <item.icon className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-asan-dark mt-4">
                  {item.title}
                </h3>
                <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. APP DETAILING — placeholder shell (content to be provided by Noushad) */}
      <section>
        {/* TODO (Noushad): App detailing section — content to be provided by Noushad. Our Story was removed per the 2026-11-24 brief. */}
      </section>

      {/* 7. HOW IT WORKS */}
      <section className="py-12 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-asan-dark dark:text-white">
              How It Works
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                step: '01',
                title: 'Register & Review',
                desc: 'Create your business account in minutes. Upload CNIC and NTN — your account is reviewed before trading.',
                badge: 'Everyone'
              },
              {
                step: '02',
                title: 'Suppliers List Products',
                desc: 'Suppliers add products with photos, prices, MOQ, and specifications.',
                badge: 'Suppliers'
              },
              {
                step: '03',
                title: 'Shopkeepers Browse & Order',
                desc: 'Shopkeepers search the marketplace by product, supplier, city, and category, and place bulk orders.',
                badge: 'Shopkeepers'
              },
              {
                step: '04',
                title: 'Place Bulk Order',
                desc: 'Shopkeepers place bulk orders with MOQ from the cart, and suppliers confirm the order.',
                badge: 'Both'
              },
              {
                step: '05',
                title: 'Order Status Updates',
                desc: 'Orders move from pending to confirmed, processing, shipped, and delivered. Shopkeepers see the status in My Orders.',
                badge: 'Both'
              },
              {
                step: '06',
                title: 'Manage From Your Portal',
                desc: 'Suppliers manage their products and orders, and shopkeepers manage their cart and orders, from their own portals.',
                badge: 'Both'
              }
            ].map((item) => (
              <div
                key={item.step}
                className="relative rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-asan-accent-light text-asan-dark dark:bg-asan-dark dark:text-asan-accent-light">
                    {item.badge}
                  </span>
                  <span className="text-2xl font-extrabold text-asan-accent/20 font-mono">
                    {item.step}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mt-4">
                  {item.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 8. DUAL PORTAL CARDS */}
      <section className="py-20 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-2 gap-8">
          
          <div className="p-6 sm:p-8 rounded-3xl bg-asan-accent-light text-asan-dark flex flex-col justify-between shadow-xl">
            <div>
              <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-asan-accent mb-6">
                <Building2 className="w-6 h-6" />
              </div>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight">For Suppliers</h3>
              <p className="text-xs sm:text-sm text-asan-text-light mt-2">
                Grow your B2B sales by listing products for shopkeepers on the marketplace.
              </p>
              <ul className="mt-6 space-y-3 text-xs sm:text-sm text-asan-dark/80">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-asan-accent shrink-0" />
                  <span>List products with photos, price per pack, MOQ, and stock</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-asan-accent shrink-0" />
                  <span>Reach shopkeepers on the marketplace</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-asan-accent shrink-0" />
                  <span>Manage your products and orders from the supplier portal</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-asan-accent shrink-0" />
                  <span>Bulk orders with minimum order quantity</span>
                </li>
              </ul>
            </div>
            <Link
              href="/getstarted?role=supplier"
              className="mt-8 inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-asan-accent hover:bg-asan-accent-hover text-white text-sm font-bold shadow-lg transition"
            >
              <span>Start as Supplier</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="p-6 sm:p-8 rounded-3xl bg-[#F7F7F7] text-asan-dark border border-asan-border flex flex-col justify-between shadow-xl">
            <div>
              <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-asan-accent mb-6">
                <Store className="w-6 h-6" />
              </div>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight">For Shopkeepers</h3>
              <p className="text-xs sm:text-sm text-asan-text-light mt-2">
                Get supplier prices directly, without travelling to mandis.
              </p>
              <ul className="mt-6 space-y-3 text-xs sm:text-sm text-asan-dark/80">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-asan-accent shrink-0" />
                  <span>Browse products actually listed on the marketplace</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-asan-accent shrink-0" />
                  <span>Search by product, supplier, city, and category</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-asan-accent shrink-0" />
                  <span>Compare products and prices across suppliers</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-asan-accent shrink-0" />
                  <span>See order status in My Orders</span>
                </li>
              </ul>
            </div>
            <Link
              href="/getstarted?role=shopkeeper"
              className="mt-8 inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-asan-dark hover:bg-asan-mid text-white text-sm font-bold shadow-lg transition"
            >
              <span>Start as Shopkeeper</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

        </div>
      </section>

      {/* FOOTER */}
      <Footer />

    </div>
  );
}
