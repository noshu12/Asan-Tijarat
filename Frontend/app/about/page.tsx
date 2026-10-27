"use client";

import React from 'react';
import Link from 'next/link';
import { Footer } from '@/components/Footer';
import {
  ShieldCheck,
  Sparkles,
  TrendingUp,
  CreditCard,
  Truck,
  Store,
  Building2,
  CheckCircle2,
  ArrowRight,
  BarChart3,
  FileCheck,
  Scale,
  Zap,
  Globe2,
  Lock,
  Layers
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function AboutPage() {
  const capabilities = [
    {
      icon: Building2,
      title: 'Direct Factory & Mandi Sourcing',
      desc: 'Connect directly with certified farmers, flour/rice mills, and textile manufacturers across Pakistan without paying 15-30% middleman agent commissions.'
    },
    {
      icon: Sparkles,
      title: 'AI Demand Forecasting & Price Trends',
      desc: 'Machine learning algorithms analyze seasonal trends, mandi harvest cycles, and regional buying patterns to predict upcoming commodity demands and price shifts.'
    },
    {
      icon: ShieldCheck,
      title: 'FBR & Chamber Verified Profiles',
      desc: 'Every business is vetted using CNIC, NTN, and Chamber of Commerce registrations so you trade with 100% authentic suppliers and verified wholesale buyers.'
    },
    {
      icon: Lock,
      title: 'Digital Escrow Payment Protection',
      desc: 'Buyer payments via JazzCash, EasyPaisa, or bank transfer are held securely in digital escrow and only released once the buyer inspects and confirms delivery.'
    },
    {
      icon: Truck,
      title: 'Nationwide Logistics & Real-Time Tracking',
      desc: 'Integrated freight milestones track shipments from mandi dispatch to doorstep delivery across all major logistics routes in Punjab, Sindh, KPK, and Balochistan.'
    },
    {
      icon: FileCheck,
      title: 'Automated NTN Invoicing & Ledgers',
      desc: 'Instant digital invoices, delivery challans, and GST/NTN compliant tax records generated automatically for every bulk wholesale order.'
    }
  ];

  const forWho = [
    {
      title: 'For Farmers, Millers & Manufacturers',
      subtitle: 'Sell Bulk Volume Directly',
      color: 'border-emerald-500/30 bg-emerald-950/20',
      points: [
        'List commodity lots with photos, lab certificates, and video walkthroughs',
        'Receive guaranteed upfront orders with funds secured in escrow',
        'Forecast production needs using AI 30-day demand predictions',
        'Eliminate payment default risks from traditional unverified credit book (udhaar)'
      ]
    },
    {
      title: 'For Shopkeepers & Distributors',
      subtitle: 'Procure at Factory-Gate Rates',
      color: 'border-blue-500/30 bg-blue-950/20',
      points: [
        'Access 89,000+ verified commodity lots across Pakistan at transparent rates',
        'Filter suppliers by verified NTN badge, star ratings, and mandi location',
        'Receive personalized AI recommendations tailored to your inventory history',
        '100% refund guarantee through built-in dispute resolution if goods don\'t match quality'
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
            Asan Tijarat is Pakistan&apos;s first complete AI-powered B2B wholesale ecosystem — connecting factories, millers, farmers, and wholesale shopkeepers with digital trust, transparent pricing, and secure escrow trading.
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
              Everything required to source, verify, negotiate, pay, and track bulk commodities nationwide.
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

        {/* 3. AI & Technical Architecture Overview */}
        <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-r from-asan-dark to-emerald-900 text-white shadow-xl relative overflow-hidden">
          <div className="relative max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-emerald-300 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Proprietary AI Engine</span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Smart Market Intelligence & Forecasting
            </h3>
            <p className="text-xs sm:text-sm text-emerald-100/90 leading-relaxed">
              Asan Tijarat deploys statistical time-series forecasting models (ARIMA & Prophet) alongside Collaborative and Content-Based recommendation filters. The platform continuously maps mandi arrivals, historic price indices, and procurement volumes to keep traders ahead of market movements.
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
              q: 'How does digital escrow protect my payments?',
              a: 'When an order is placed, your payment (JazzCash, EasyPaisa, or Bank) is locked securely in escrow. The supplier only receives the funds after you receive the goods and confirm quality inspection.'
            },
            {
              q: 'How is supplier verification conducted?',
              a: 'All suppliers submit their CNIC, FBR NTN registration, and physical warehouse/mandi details. Our compliance team verifies tax active status before issuing the Verified Trader badge.'
            },
            {
              q: 'What commodities are available for wholesale purchase?',
              a: 'The platform hosts Basmati Rice, Grains, Faisalabad Combed Cotton, Multan Spices, Pure Desi Buffalo Ghee, Khewra Himalayan Salt, and daily mandi farm produce with clearly defined MOQs.'
            },
            {
              q: 'Can suppliers update prices in real-time according to mandi rates?',
              a: 'Yes. Suppliers have full control through their dedicated portal to adjust bulk unit pricing, modify available lot stock, and apply volume discounts anytime.'
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