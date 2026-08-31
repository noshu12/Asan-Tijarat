"use client";

import React from 'react';
import { PortalHeader } from '@/components/PortalHeader';
import { StatsCard } from '@/components/StatsCard';
import { MONTHLY_SPENDING_SAVINGS, TOP_SUPPLIERS } from '@/lib/mockData';
import { formatPKR } from '@/lib/utils';
import { DollarSign, ShoppingCart, Award, Store, ShieldCheck, Star } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

export default function ShopkeeperAnalyticsPage() {
  return (
    <div className="space-y-8">
      <PortalHeader
        title="Analytics"
        subtitle="Thursday, 3 July 2026 • Shopkeeper Portal"
      />

      {/* 4 Stats Cards matching Figma w9.png */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Spent"
          value="Rs 2.1M"
          change="+11%"
          isPositive={true}
          icon={DollarSign}
        />
        <StatsCard
          title="Orders Placed"
          value="89"
          change="+5.2%"
          isPositive={true}
          icon={ShoppingCart}
        />
        <StatsCard
          title="Savings This Month"
          value="Rs 79,000"
          change="+18.4%"
          isPositive={true}
          icon={Award}
        />
        <StatsCard
          title="Active Suppliers"
          value="18"
          change="+2"
          isPositive={true}
          icon={Store}
        />
      </div>

      {/* Monthly Spending vs Savings Chart & Top Suppliers Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Chart Column */}
        <div className="lg:col-span-2 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-6">
            Monthly Spending vs Savings (PKR)
          </h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={MONTHLY_SPENDING_SAVINGS}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(val) => `Rs${val/1000}k`} />
                <Tooltip formatter={(value: number | string) => formatPKR(Number(value))} />
                <Legend />
                <Bar dataKey="spent" name="Spent" fill="#0B3D2E" radius={[6, 6, 0, 0]} />
                <Bar dataKey="savings" name="Savings" fill="#27AE7A" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Suppliers Column matching Figma w9.png */}
        <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
            Top Suppliers
          </h3>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {TOP_SUPPLIERS.map((supp, index) => (
              <div key={supp.id} className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono font-bold text-slate-400">#{index + 1}</span>
                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold text-xs flex items-center justify-center">
                    {supp.initials}
                  </div>
                  <div>
                    <p className="font-bold text-xs text-slate-900 dark:text-white">{supp.name}</p>
                    <div className="flex items-center gap-1 text-[11px] text-amber-500">
                      <Star className="w-3 h-3 fill-amber-400" />
                      <span>{supp.rating}</span>
                      <span className="text-slate-400">({supp.ordersCount} orders)</span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <p className="font-extrabold text-xs text-slate-900 dark:text-white">
                    {formatPKR(supp.tradeVolume)}
                  </p>
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                    <ShieldCheck className="w-3 h-3" />
                    Verified
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
}
