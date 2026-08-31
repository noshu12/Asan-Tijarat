"use client";

import React, { useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCw, House } from 'lucide-react';

/**
 * Route-level error boundary — catches render/data errors in any child
 * segment and shows a branded recovery screen instead of the default overlay.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface for diagnostics tooling; visible in DevTools only.
    console.error('[Asan Tijarat] Unhandled application error:', error);
  }, [error]);

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-16 bg-slate-50 dark:bg-slate-950">
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', duration: 0.45 }}
        className="w-full max-w-lg rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl shadow-slate-200/60 dark:shadow-black/20 p-10 text-center"
      >
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/50">
          <AlertTriangle className="h-8 w-8 text-asan-error" />
        </div>

        <h1 className="text-2xl font-extrabold tracking-tight text-asan-dark dark:text-white">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          An unexpected error interrupted your trading session. Don&apos;t worry — your cart,
          orders, and listings remain safely saved.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            onClick={reset}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-asan-accent px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-700/20 transition hover:bg-asan-accent-hover sm:w-auto"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </button>
          <Link
            href="/"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800 sm:w-auto"
          >
            <House className="h-4 w-4" />
            Back to Home
          </Link>
        </div>

        {error.digest && (
          <p className="mt-6 font-mono text-[11px] text-slate-400 dark:text-slate-500">
            Error ref: {error.digest}
          </p>
        )}
      </motion.div>
    </div>
  );
}
