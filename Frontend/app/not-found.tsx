"use client";

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { House, SearchX, Store } from 'lucide-react';

/** Custom 404 — keeps lost traders inside the Asan Tijarat funnel. */
export default function NotFound() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-16 bg-slate-50 dark:bg-slate-950">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', duration: 0.5 }}
        className="w-full max-w-xl text-center"
      >
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/50">
          <SearchX className="h-10 w-10 text-asan-accent" />
        </div>

        <p className="bg-gradient-to-r from-asan-dark via-asan-mid to-asan-accent bg-clip-text text-7xl font-black tracking-tighter text-transparent sm:text-8xl">
          404
        </p>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-asan-dark dark:text-white">
          Page Not Found
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          The aisle you&apos;re looking for doesn&apos;t exist — it may have been moved, renamed,
          or never stocked in this bazaar. Let&apos;s get you back to trading.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-asan-accent px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-700/20 transition hover:bg-asan-accent-hover sm:w-auto"
          >
            <House className="h-4 w-4" />
            Back to Home
          </Link>
          <Link
            href="/marketplace"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-asan-accent px-5 py-2.5 text-sm font-bold text-asan-accent transition hover:bg-asan-accent/10 dark:hover:bg-asan-accent/20 sm:w-auto"
          >
            <Store className="h-4 w-4" />
            Browse Marketplace
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
