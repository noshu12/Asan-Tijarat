"use client";

import React from 'react';
import Link from 'next/link';
import { CoverflowCarousel, CoverflowSlide } from '@/components/ui/coverflow-carousel';
import { CATEGORIES_LIST } from '@/lib/mockData';
import { Footer } from '@/components/Footer';
import {
  ShieldCheck,
  Sparkles,
  TrendingUp,
  CreditCard,
  Truck,
  Users,
  ArrowRight,
  CheckCircle2,
  Package,
  Store,
  Building2,
} from 'lucide-react';

const COMMODITY_SLIDES: CoverflowSlide[] = [
  {
    src: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=800&h=800&fit=crop',
    alt: 'Super Kernel Basmati Rice',
    title: 'Super Kernel Basmati Rice',
    subtitle: 'Punjab Agri Exports • Sheikhupura',
    meta: [
      { label: 'Grade', value: 'Export Super Kernel' },
      { label: 'MOQ', value: '10 Bags (50kg)' },
      { label: 'Price', value: 'Rs 4,500/bag' }
    ]
  },
  {
    src: 'https://images.unsplash.com/photo-1528459801416-a9e53bbf4e17?w=800&h=800&fit=crop',
    alt: 'Faisalabad Export Cotton Fabric',
    title: 'White Cotton Shirting Fabric',
    subtitle: 'Faisalabad Textile Mills • Faisalabad',
    meta: [
      { label: 'Weave', value: '60/60 Combed' },
      { label: 'MOQ', value: '10 Rolls (100m)' },
      { label: 'Price', value: 'Rs 850/m' }
    ]
  },
  {
    src: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=800&h=800&fit=crop',
    alt: 'Lahori Red Chilli Powder',
    title: 'Pure Red Chilli Powder',
    subtitle: 'Multan Masala House • Multan',
    meta: [
      { label: 'Purity', value: '100% Lab Tested' },
      { label: 'MOQ', value: '5 Packs (5kg)' },
      { label: 'Price', value: 'Rs 2,200/pack' }
    ]
  },
  {
    src: 'https://images.unsplash.com/photo-1631451095765-2c91616fc9e6?w=800&h=800&fit=crop',
    alt: 'Pure Buffalo Desi Ghee',
    title: 'Traditional Desi Buffalo Ghee',
    subtitle: 'Gujranwala Dairy Farm • Gujranwala',
    meta: [
      { label: 'Process', value: 'Bilona Churned' },
      { label: 'MOQ', value: '5 Tins (5kg)' },
      { label: 'Price', value: 'Rs 3,800/tin' }
    ]
  },
  {
    src: 'https://images.unsplash.com/photo-1518110925495-5fe2fda0442c?w=800&h=800&fit=crop',
    alt: 'Himalayan Pink Rock Salt',
    title: 'Himalayan Pink Rock Salt',
    subtitle: 'Khewra Salt Mines Co. • Khewra',
    meta: [
      { label: 'Minerals', value: '84 Trace Elements' },
      { label: 'MOQ', value: '20 Bags (50kg)' },
      { label: 'Price', value: 'Rs 180/bag' }
    ]
  },
  {
    src: 'https://images.unsplash.com/photo-1518977822534-7049a61ee0c2?w=800&h=800&fit=crop',
    alt: 'Sindh Red Onions',
    title: 'Sindhi Red Onions (Grade 1)',
    subtitle: 'Hyderabad Fresh Farms • Hyderabad',
    meta: [
      { label: 'Freshness', value: 'Farm Fresh' },
      { label: 'MOQ', value: '10 Crates (100kg)' },
      { label: 'Price', value: 'Rs 120/kg' }
    ]
  }
];

export default function HomePage() {
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

            {/* Subtext */}
            <p className="mt-6 text-base sm:text-xl text-emerald-100/80 max-w-2xl mx-auto leading-relaxed">
              Connect suppliers and shopkeepers across Pakistan. Verified profiles, AI-powered recommendations, and real-time order tracking â€” all in one place.
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

      {/* 2. STATS BANNER */}
      <section className="bg-emerald-900/60 border-y border-emerald-800 text-white py-8 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div>
            <p className="text-3xl sm:text-4xl font-extrabold text-emerald-300">12,400+</p>
            <p className="text-xs sm:text-sm text-emerald-100/70 uppercase tracking-wider font-semibold mt-1">Verified Suppliers</p>
          </div>
          <div>
            <p className="text-3xl sm:text-4xl font-extrabold text-emerald-300">89,000+</p>
            <p className="text-xs sm:text-sm text-emerald-100/70 uppercase tracking-wider font-semibold mt-1">Products Listed</p>
          </div>
          <div>
            <p className="text-3xl sm:text-4xl font-extrabold text-emerald-300">Rs 2.4B+</p>
            <p className="text-xs sm:text-sm text-emerald-100/70 uppercase tracking-wider font-semibold mt-1">Trade Processed</p>
          </div>
          <div>
            <p className="text-3xl sm:text-4xl font-extrabold text-emerald-300">4.8 â˜…</p>
            <p className="text-xs sm:text-sm text-emerald-100/70 uppercase tracking-wider font-semibold mt-1">Average Trader Rating</p>
          </div>
        </div>
      </section>

      {/* 3. 3D COVERFLOW COMMODITIES SHOWCASE */}
      <section className="py-16 bg-slate-50 dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center mb-6">
          <span className="inline-block px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold text-xs uppercase tracking-wider mb-2">
            Trending Wholesale Commodities
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-asan-dark dark:text-white">
            High-Volume Commodities Moving Right Now
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-xl mx-auto">
            Swipe or use arrow keys to inspect active wholesale lots from verified mills and farms across Pakistan.
          </p>
        </div>

        <div className="max-w-5xl mx-auto">
          <CoverflowCarousel
            slides={COMMODITY_SLIDES}
            showCaption
            showPagination
            showNavigation
          />
        </div>
      </section>

      {/* 4. TOP CATEGORIES */}
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
              From daily ration staples to industrial textiles â€” find verified bulk suppliers across every major category.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {CATEGORIES_LIST.filter(c => c.id !== 'all').map((cat) => (
              <Link
                key={cat.id}
                href={`/marketplace?cat=${cat.id}`}
                className="group relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-xl transition-all"
              >
                <div className="aspect-square w-full overflow-hidden">
                  <img
                    src={cat.image}
                    alt={cat.name}
                    className="h-full w-full object-cover group-hover:scale-110 transition duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                </div>
                <div className="absolute bottom-3 left-3 right-3 text-white">
                  <p className="font-bold text-xs sm:text-sm leading-tight group-hover:text-emerald-300 transition">
                    {cat.name}
                  </p>
                </div>
              </Link>
            ))}
          </div>

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
                Built for Pakistan&apos;s Backbone â€” Its Traders
              </h2>
              <p className="text-emerald-100/80 text-sm sm:text-base leading-relaxed mt-6">
                Pakistan&apos;s wholesale economy runs on trust and relationships â€” but finding reliable suppliers, negotiating fair prices, and getting paid on time has always been a struggle. Traders lose lakhs every year to fraud, delayed payments, and middlemen who add cost without value.
              </p>
              <p className="text-emerald-100/80 text-sm sm:text-base leading-relaxed mt-4">
                We built <strong>Asan Tijarat</strong> to fix this. A digital marketplace where every supplier is verified, every transaction is protected, and AI helps both sides make smarter decisions. No middlemen. No guesswork. Just trade â€” made easy.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-asan-accent shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-sm">Verified Profiles</h4>
                    <p className="text-xs text-emerald-200/70">Every supplier vetted with CNIC & NTN checks</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-asan-accent shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-sm">AI Recommendations</h4>
                    <p className="text-xs text-emerald-200/70">Smart suggestions based on your region & history</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CreditCard className="w-5 h-5 text-asan-accent shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-sm">Secure Payments</h4>
                    <p className="text-xs text-emerald-200/70">JazzCash, EasyPaisa, and card escrow protection</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-asan-accent shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-sm">Dispute Protection</h4>
                    <p className="text-xs text-emerald-200/70">Built-in resolution so neither side loses unfairly</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md flex flex-col justify-between h-44">
                <TrendingUp className="w-8 h-8 text-emerald-400" />
                <div>
                  <p className="text-2xl sm:text-3xl font-extrabold text-white">Rs 2.4B+</p>
                  <p className="text-xs text-emerald-200/70 mt-1">Trade Processed</p>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md flex flex-col justify-between h-44">
                <ShieldCheck className="w-8 h-8 text-emerald-400" />
                <div>
                  <p className="text-2xl sm:text-3xl font-extrabold text-white">12,400+</p>
                  <p className="text-xs text-emerald-200/70 mt-1">Verified Suppliers</p>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md flex flex-col justify-between h-44">
                <Package className="w-8 h-8 text-emerald-400" />
                <div>
                  <p className="text-2xl sm:text-3xl font-extrabold text-white">89,000+</p>
                  <p className="text-xs text-emerald-200/70 mt-1">Products Listed</p>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md flex flex-col justify-between h-44">
                <Users className="w-8 h-8 text-emerald-400" />
                <div>
                  <p className="text-2xl sm:text-3xl font-extrabold text-white">99.2%</p>
                  <p className="text-xs text-emerald-200/70 mt-1">Dispute Resolution Rate</p>
                </div>
              </div>
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
                title: 'Register & Verify',
                desc: 'Create your business account in minutes. Upload CNIC and NTN â€” our team verifies your profile with the trusted badge.',
                badge: 'Everyone'
              },
              {
                step: '02',
                title: 'Suppliers List Products',
                desc: 'Suppliers add products with photos, prices, MOQ, and specifications. AI automatically suggests trending categories & pricing.',
                badge: 'Suppliers'
              },
              {
                step: '03',
                title: 'Shopkeepers Browse & Order',
                desc: 'Shopkeepers search the marketplace, see personalized AI recommendations tailored to their city, and place bulk orders.',
                badge: 'Shopkeepers'
              },
              {
                step: '04',
                title: 'Pay Securely',
                desc: 'Pay via JazzCash, EasyPaisa, or card. Funds are held safely in escrow until the shopkeeper confirms delivery.',
                badge: 'Both'
              },
              {
                step: '05',
                title: 'Track & Deliver',
                desc: 'Real-time order tracking from confirmation to doorstep. Auto-invoicing, SMS alerts, and dispute resolution built in.',
                badge: 'Both'
              },
              {
                step: '06',
                title: 'Grow Together',
                desc: 'Analytics dashboards show you trends, top products, and demand forecasts so both suppliers and shopkeepers scale profitably.',
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
                Grow your B2B sales volume with guaranteed upfront payments and verified buyers nationwide.
              </p>
              <ul className="mt-6 space-y-3 text-xs sm:text-sm text-emerald-100/90">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-asan-accent shrink-0" />
                  <span>List unlimited products with photos & video walkthroughs</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-asan-accent shrink-0" />
                  <span>Reach 50,000+ verified shopkeepers</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-asan-accent shrink-0" />
                  <span>AI Demand Forecasting to predict inventory needs</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-asan-accent shrink-0" />
                  <span>Auto-generate NTN compliant wholesale invoices</span>
                </li>
              </ul>
            </div>
            <Link
              href="/signin?role=supplier"
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
                Get direct factory prices without paying middleman margins or travelling to mandis.
              </p>
              <ul className="mt-6 space-y-3 text-xs sm:text-sm text-white/90">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
                  <span>Browse 89,000+ verified wholesale commodities</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
                  <span>AI picks items trending in your city & category</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
                  <span>Compare rates across multiple Punjab & Sindh mills</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
                  <span>Track every shipment live with escrow protection</span>
                </li>
              </ul>
            </div>
            <Link
              href="/signin?role=shopkeeper"
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