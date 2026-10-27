"use client";

import React from 'react';
import Link from 'next/link';
import { Footer } from '@/components/Footer';
import {
  ShieldCheck,
  Store,
  Building2,
  CheckCircle2,
  ArrowRight,
  FileCheck,
  Globe2
} from 'lucide-react';

export default function AboutPage() {
  const capabilities = [
    {
      icon: Building2,
      title: 'Direct Factory & Mandi Sourcing',
      desc: 'Connect directly with farmers, flour/rice mills, and textile manufacturers across Pakistan, and browse their listed products on the marketplace.'
    },
    {
      icon: CheckCircle2,
      title: 'Order Status You Can Follow',
      desc: 'Every order moves through pending, confirmed, processing, shipped, and delivered, and its current status is visible in the supplier and shopkeeper portals.'
    },
    {
      icon: ShieldCheck,
      title: 'Accounts Reviewed Before Trading',
      desc: 'Businesses register with their business details and NTN, submit CNIC and NTN documents, and an admin reviews the account before it can trade.'
    },
    {
      icon: Store,
      title: 'Separate Supplier & Shopkeeper Portals',
      desc: 'Suppliers list products and manage their orders, while shopkeepers browse the marketplace, place bulk orders, and track them in My Orders.'
    },
    {
      icon: Globe2,
      title: 'Public Marketplace to Browse',
      desc: 'Anyone can browse products listed by suppliers, search by product, supplier, city, or category, and compare price per pack and minimum order quantity.'
    },
    {
      icon: FileCheck,
      title: 'Downloadable Order Invoice',
      desc: 'For each order you can download an invoice showing the items, quantities, price per pack, subtotal, and total amount.'
    }
  ];

  const forWho = [
    {
      title: 'For Farmers, Millers & Manufacturers',
      subtitle: 'Sell Bulk Volume Directly',
      color: 'border-emerald-500/30 bg-emerald-950/20',
      points: [
        'List products with photos, price per pack, pack size, MOQ, and stock',
        'Receive bulk orders from shopkeepers and manage them from the supplier portal',
        'Manage your listings and orders from one place',
        'Confirm, process, ship, and deliver orders, with the status visible to the shopkeeper'
      ]
    },
    {
      title: 'For Shopkeepers & Distributors',
      subtitle: 'Procure at Factory-Gate Rates',
      color: 'border-blue-500/30 bg-blue-950/20',
      points: [
        'Browse products listed by suppliers at transparent price per pack',
        'Search and filter by product, supplier, city, and category',
        'Compare products and prices before placing a bulk order',
        'Track order status in My Orders, from pending to delivered'
      ]
    }
  ];

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950">
      
      {/* Hero Header */}
      <section className="bg-asan-dark text-white py-20 text-center border-b border-emerald-900 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full overflow-hidden pointer-events-none opacity-20">
          <div className="absolute -top-24 left-1/4 w-96 h-96 bg-emerald-500 rounded-full blur-3xl" />
          <div className="absolute top-1/2 right-1/4 w-96 h-96 bg-emerald-400 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-4xl mx-auto px-4">
          <span className="inline-block px-4 py-1.5 rounded-full bg-white/10 text-emerald-300 text-xs font-bold uppercase tracking-wider mb-6 border border-white/10 backdrop-blur">
            Platform Capabilities & Mission
          </span>
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight">
            What Can You Do on <br />
            <span className="text-emerald-400">Asan Tijarat?</span>
          </h1>
          <p className="mt-6 text-sm sm:text-lg text-emerald-100/90 max-w-2xl mx-auto leading-relaxed">
            Asan Tijarat is a B2B wholesale marketplace connecting suppliers and shopkeepers in Pakistan — with separate portals, bulk orders with minimum order quantity, and price per pack, clearly shown.
          </p>
        </div>
      </section>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-20 flex-1">
        
        {/* 1. Core Platform Capabilities Grid */}
        <div>
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold text-xs uppercase tracking-wider">
              Core Capabilities
            </span>
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mt-3">
              Powering Modern B2B Commerce in Pakistan
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-2">
              Everything required to list products, browse the marketplace, place bulk orders, and follow order status.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {capabilities.map((cap, idx) => {
              const Icon = cap.icon;
              return (
                <div
                  key={idx}
                  className="p-7 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-emerald-500/40 transition-all group flex flex-col justify-between"
                >
                  <div>
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-asan-accent mb-5 group-hover:scale-110 transition">
                      <Icon className="w-6 h-6" />
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition">
                      {cap.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-2.5 leading-relaxed">
                      {cap.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2. Value Breakdown by Stakeholder */}
        <div>
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold text-xs uppercase tracking-wider">
              Dual Ecosystem
            </span>
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mt-3">
              Designed for Both Sides of Wholesale
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {forWho.map((item, idx) => (
              <div
                key={idx}
                className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-6"
              >
                <div>
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                    {item.subtitle}
                  </span>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                    {item.title}
                  </h3>

                  <ul className="mt-6 space-y-3.5">
                    {item.points.map((pt, i) => (
                      <li key={i} className="flex items-start gap-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                        <CheckCircle2 className="w-4 h-4 text-asan-accent shrink-0 mt-0.5" />
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Link
                  href={idx === 0 ? "/signin" : "/marketplace"}
                  className="inline-flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  <span>{idx === 0 ? "Start as a Supplier" : "Browse Wholesale Marketplace"}</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* 3. How Trading Works */}
        <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-r from-asan-dark to-emerald-900 text-white shadow-xl relative overflow-hidden">
          <div className="relative max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-emerald-300 text-xs font-bold">
              <span>How It Works</span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              From Registration to Delivery
            </h3>
            <p className="text-xs sm:text-sm text-emerald-100/90 leading-relaxed">
              Register as a supplier or shopkeeper and get your account reviewed. Suppliers list products with photos, price per pack, and MOQ. Shopkeepers browse the marketplace and place bulk orders. Suppliers confirm, process, ship, and deliver, and the order status stays visible in the portals at every step.
            </p>
          </div>
        </div>

        {/* 4. Frequently Asked Questions */}
        <div className="space-y-4">
          <div className="text-center mb-8">
            <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              Frequently Asked Questions
            </h3>
            <p className="text-xs text-slate-500 mt-1">Everything you need to know about trading on Asan Tijarat</p>
          </div>

          {[
            {
              q: 'How do orders work on Asan Tijarat?',
              a: 'A shopkeeper places a bulk order from the marketplace. The supplier confirms it, then processes, ships, and delivers it. The order status is visible in My Orders at every step, from pending to delivered.'
            },
            {
              q: 'How is supplier verification conducted?',
              a: 'Businesses register with their business name, city, and NTN, and submit CNIC and NTN documents. An admin reviews the account before it can trade.'
            },
            {
              q: 'What commodities are available for wholesale purchase?',
              a: 'Whatever suppliers have listed on the marketplace. Browse the marketplace and filter by category, product, supplier, or city to see what is currently available.'
            },
            {
              q: 'Can suppliers update prices according to mandi rates?',
              a: 'Yes. Suppliers can manage their listings through their dedicated portal, including bulk unit pricing, pack size, MOQ, and available stock.'
            }
          ].map((faq, idx) => (
            <div key={idx} className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">{faq.q}</h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>

      </main>

      <Footer />
    </div>
  );
}
