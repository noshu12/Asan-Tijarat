"use client";

import React from 'react';
import { AI_DEMAND_FORECAST } from '@/lib/mockData';
import { Sparkles } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

export default function SupplierAnalyticsPage() {
  return (
    <div className="space-y-8">
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-2xl sm:text-3xl font-bold text-asan-dark dark:text-white tracking-tight">
          AI Demand Forecasting & Analytics
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Predictive machine learning algorithms (ARIMA & Prophet) forecasting 30-day procurement
        </p>
      </div>

      <div className="p-6 rounded-3xl bg-gradient-to-r from-emerald-950 to-asan-dark text-white border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-asan-accent/20 border border-asan-accent flex items-center justify-center text-asan-accent shrink-0">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              Next 30 Days Forecast: Super Kernel Basmati Rice Demand Up +34%
            </h3>
            <p className="text-xs text-emerald-200/80 mt-0.5">
              Karachi and Lahore retail markets are projecting high procurement needs ahead of harvest transitions.
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              30-Day Demand Forecast vs Actual Orders (Bags / 100)
            </h3>
            <p className="text-xs text-slate-400">Shaded area represents 95% confidence interval</p>
          </div>
          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 px-3 py-1 rounded-full w-fit">
            Confidence: 94.8%
          </span>
        </div>

        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={AI_DEMAND_FORECAST}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
              <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="actual" name="Actual Orders" stroke="#0B3D2E" strokeWidth={3} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="forecast" name="AI Projected Forecast" stroke="#27AE7A" strokeWidth={3} strokeDasharray="5 5" />
              <Line type="monotone" dataKey="upper" name="Upper Bound (95%)" stroke="#94a3b8" strokeWidth={1} strokeDasharray="2 2" dot={false} />
              <Line type="monotone" dataKey="lower" name="Lower Bound (95%)" stroke="#94a3b8" strokeWidth={1} strokeDasharray="2 2" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}