"use client";

import React from 'react';

export default function SupplierAnalyticsPage() {
  return (
    <div className="space-y-8">
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-2xl sm:text-3xl font-bold text-asan-dark dark:text-white tracking-tight">
          Analytics
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Your sales and demand summary will appear here once you have real orders.
        </p>
      </div>

      <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm text-center">
        <h3 className="text-base font-bold text-slate-900 dark:text-white">
          No analytics yet
        </h3>
        <p className="text-xs text-slate-500 mt-2">
          No orders or sales data to show yet. Once real orders are placed, your analytics will appear here automatically.
        </p>
      </div>
    </div>
  );
}
