"use client";

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ProductCard } from '@/components/ProductCard';
import { Footer } from '@/components/Footer';
import {
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  Package,
  Store,
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

export default function HomePage() {
  // Real catalogue from GET /api/products. On backend failure this stays
  // empty on purpose — no mock fallback, so no fake products ever show here.
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.products();
        setProducts(data.products);
      } catch {
        setProducts([]);
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, []);

  const topProducts = useMemo(() => products.slice(0, 8), [products]);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const product of products) {
      if (product.category && !seen.has(product.category)) {
        seen.add(product.category);
        list.push(product.category);
      }
    }
    return list;
  }, [products]);

  const suppliers = useMemo(() => {
    const seen = new Set<string>();
    for (const product of products) {
      if (product.supplierName) seen.add(product.supplierName);
    }
    return seen.size;
  }, [products]);

  return (
    <div className="flex flex-col min-h-screen">
      
      {/* 1. HERO SECTION */}
      <section className="relative bg-asan-dark text-white pt-20 pb-24 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full overflow-hidden pointer-events-none opacity-20">
          <div className="absolute -top-24 left-1/4 w-96 h-96 bg-emerald-500 rounded-full blur-3xl" />
          <div className="absolute top-1/2 right-1/4 w-96 h-96 bg-emerald-400 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">

            {/* Headline */}
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight max-w-4xl mx-auto leading-[1.1]">
              Wholesale Trade, <br />
              <span className="text-emerald-400">Made Simple</span>
            </h1>

            {/* Subtext — true claims only */}
            <p className="mt-6 text-base sm:text-xl text-emerald-100/80 max-w-2xl mx-auto leading-relaxed">
              Connect suppliers and shopkeepers across Pakistan. Separate portals, bulk orders with minimum order quantity, and price per pack, clearly shown — all in one place.
            </p>

            {/* CTAs */}
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/signin"
                className="group inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-asan-accent hover:bg-asan-accent-hover text-white text-sm font-bold shadow-lg shadow-emerald-950/40 transition"
              >
                <Building2 className="w-4 h-4" />
                <span>I&apos;m a Supplier</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>

              <Link
                href="/marketplace"
                className="group inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 text-white text-sm font-bold backdrop-blur-md transition"
              >
                <Store className="w-4 h-4" />
                <span>I&apos;m a Shopkeeper</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
        </div>
      </section>

      {/* 2. STATS BANNER — real counts from listed products only */}
      <section className="bg-emerald-900/60 border-y border-emerald-800 text-white py-8 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
          <div>
            <p className="text-3xl sm:text-4xl font-extrabold text-emerald-300">{isLoading ? '…' : products.length}</p>
            <p className="text-xs sm:text-sm text-emerald-100/70 uppercase tracking-wider font-semibold mt-1">Products Listed</p>
          </div>
          <div>
            <p className="text-3xl sm:text-4xl font-extrabold text-emerald-300">{isLoading ? '…' : categories.length}</p>
            <p className="text-xs sm:text-sm text-emerald-100/70 uppercase tracking-wider font-semibold mt-1">Categories</p>
          </div>
          <div>
            <p className="text-3xl sm:text-4xl font-extrabold text-emerald-300">{isLoading ? '…' : suppliers}</p>
            <p className="text-xs sm:text-sm text-emerald-100/70 uppercase tracking-wider font-semibold mt-1">Suppliers</p>
          </div>
        </div>
      </section>

      {/* 3. TOP PRODUCTS — real products only, no mock slides */}
      <section className="py-16 bg-slate-50 dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center mb-6">
          <span className="inline-block px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold text-xs uppercase tracking-wider mb-2">
            Trending Wholesale Commodities
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-asan-dark dark:text-white">
            High-Volume Commodities Moving Right Now
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-xl mx-auto">
            Active wholesale lots from suppliers on Asan Tijarat.
          </p>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {topProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 4. TOP CATEGORIES — categories from real products only */}
      <section className="py-20 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold text-xs uppercase tracking-wider">
              What We Trade
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-asan-dark dark:text-white mt-3">
              Browse Top Categories
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              Categories from products actually listed on the marketplace.
            </p>
          </div>

          {isLoading ? (
            <p className="text-center text-sm text-slate-500">Loading categories…</p>
          ) : categories.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">No categories yet</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No categories to show yet. Once real products are listed, their categories will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {categories.map((category) => {
                const slug = CATEGORY_SLUG[category];
                const href = slug ? `/marketplace?cat=${slug}` : '/marketplace';
                return (
                  <Link
                    key={category}
                    href={href}
                    className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-xl transition-all p-6 text-center"
                  >
                    <p className="font-bold text-xs sm:text-sm leading-tight group-hover:text-emerald-600 transition">
                      {category}
                    </p>
                  </Link>
                );
              })}
            </div>
          )}

          <div className="mt-10 text-center">
            <Link
              href="/marketplace"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-asan-accent hover:bg-asan-accent-hover text-white text-sm font-bold shadow-md shadow-emerald-700/20 transition"
            >
              <span>View All Products</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* 5. BUILT FOR PAKISTAN'S BACKBONE */}
      <section className="py-20 bg-asan-dark text-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            
            <div>
              <span className="px-3 py-1 rounded-full bg-white/10 border border-white/20 text-emerald-300 font-bold text-xs uppercase tracking-wider">
                Our Story
              </span>
              <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mt-4 leading-tight">
                Built for Pakistan&apos;s Backbone — Its Traders
              </h2>
              <p className="text-emerald-100/80 text-sm sm:text-base leading-relaxed mt-6">
                Pakistan&apos;s wholesale economy runs on trust and relationships — but finding reliable suppliers, negotiating fair prices, and ordering in bulk has always been a struggle. Traders lose time and money to middlemen who add cost without value.
              </p>
              <p className="text-emerald-100/80 text-sm sm:text-base leading-relaxed mt-4">
                We built <strong>Asan Tijarat</strong> to fix this. A digital marketplace where suppliers and shopkeepers connect directly, with separate portals, bulk orders, and prices shown clearly per pack. No middlemen. No guesswork. Just trade — made easy.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-asan-accent shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-sm">Accounts reviewed before trading</h4>
                    <p className="text-xs text-emerald-200/70">Business accounts are reviewed before trading</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Building2 className="w-5 h-5 text-asan-accent shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-sm">Bulk orders with MOQ</h4>
                    <p className="text-xs text-emerald-200/70">Order in bulk with minimum order quantity</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Package className="w-5 h-5 text-asan-accent shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-sm">Price per pack, clearly shown</h4>
                    <p className="text-xs text-emerald-200/70">Prices shown per pack, with pack size and stock</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Store className="w-5 h-5 text-asan-accent shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-sm">Separate portals</h4>
                    <p className="text-xs text-emerald-200/70">Separate shopkeeper and supplier portals</p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <p className="text-emerald-100/80 text-sm sm:text-base leading-relaxed">
                Suppliers list their products, shopkeepers browse the marketplace, and orders move through clear stages from pending to delivered. Everything you see on this page comes from products actually listed on the platform.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* 6. HOW IT WORKS */}
      <section className="py-20 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold text-xs uppercase tracking-wider">
              How It Works
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-asan-dark dark:text-white mt-3">
              Simple for Everyone
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              Whether you supply goods or buy in bulk, Asan Tijarat fits your workflow in six easy steps.
            </p>
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
                className="relative rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    {item.badge}
                  </span>
                  <span className="text-3xl font-extrabold text-emerald-500/20 font-mono">
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

      {/* 7. DUAL PORTAL CARDS */}
      <section className="py-20 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-2 gap-8">
          
          <div className="p-8 sm:p-10 rounded-3xl bg-asan-dark text-white flex flex-col justify-between shadow-xl">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-800/80 flex items-center justify-center text-emerald-300 mb-6">
                <Building2 className="w-6 h-6" />
              </div>
              <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight">For Suppliers</h3>
              <p className="text-xs sm:text-sm text-emerald-200/70 mt-2">
                Grow your B2B sales by listing products for shopkeepers on the marketplace.
              </p>
              <ul className="mt-6 space-y-3 text-xs sm:text-sm text-emerald-100/90">
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
              href="/getstarted"
              className="mt-8 inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-asan-accent hover:bg-asan-accent-hover text-white text-sm font-bold shadow-lg transition"
            >
              <span>Start as Supplier</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="p-8 sm:p-10 rounded-3xl bg-emerald-700 text-white flex flex-col justify-between shadow-xl">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-white mb-6">
                <Store className="w-6 h-6" />
              </div>
              <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight">For Shopkeepers</h3>
              <p className="text-xs sm:text-sm text-emerald-100 mt-2">
                Get supplier prices directly, without travelling to mandis.
              </p>
              <ul className="mt-6 space-y-3 text-xs sm:text-sm text-white/90">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
                  <span>Browse products actually listed on the marketplace</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
                  <span>Search by product, supplier, city, and category</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
                  <span>Compare products and prices across suppliers</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
                  <span>See order status in My Orders</span>
                </li>
              </ul>
            </div>
            <Link
              href="/getstarted"
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
