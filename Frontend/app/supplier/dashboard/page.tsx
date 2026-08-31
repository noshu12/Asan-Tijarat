"use client";

import React from 'react';
import Link from 'next/link';
import { PortalHeader } from '@/components/PortalHeader';
import { StatsCard } from '@/components/StatsCard';
import { SUPPLIER_REVENUE_CHART, SALES_BY_CATEGORY } from '@/lib/mockData';
import { useOrders } from '@/context/OrderContext';
import { useAuth } from '@/context/AuthContext';
import { formatPKR } from '@/lib/utils';
import { OrderTable } from '@/components/OrderTable';
import { DollarSign, Package, ShoppingCart, Star, PlusCircle } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

export default function SupplierDashboardPage() {
  const { orders } = useOrders();
  const { user } = useAuth();
  const recentOrders = orders.filter((order) => order.supplierId === user?.id).slice(0, 3);
  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-asan-dark dark:text-white tracking-tight">
            Supplier Portal
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Thursday, 3 July 2026 • Ahmed Khan Enterprises (Lahore)
          </p>
        </div>

        <Link
          href="/supplier/add-product"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-asan-accent hover:bg-asan-accent-hover text-white text-xs font-bold shadow-md shadow-emerald-700/20 transition self-start sm:self-auto"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Add New Product</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Revenue"
          value="Rs 4.8M"
          change="+14.2%"
          isPositive={true}
          icon={DollarSign}
        />
        <StatsCard
          title="Active Listings"
          value="24"
          change="+3"
          isPositive={true}
          icon={Package}
        />
        <StatsCard
          title="Total Orders"
          value="342"
          change="+8.1%"
          isPositive={true}
          icon={ShoppingCart}
        />
        <StatsCard
          title="Average Rating"
          value="4.8 ★"
          change="98% Positive"
          isPositive={true}
          icon={Star}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Revenue Growth (PKR)
            </h3>
            <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 px-2.5 py-1 rounded-full">
              +14.2% YoY
            </span>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={SUPPLIER_REVENUE_CHART}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#27AE7A" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#27AE7A" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `Rs${v/1000}k`} />
                <Tooltip formatter={(value: number | string) => formatPKR(Number(value))} />
                <Area type="monotone" dataKey="revenue" stroke="#27AE7A" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
            Sales by Category
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={SALES_BY_CATEGORY}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {SALES_BY_CATEGORY.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Recent Received Orders</h3>
          <Link href="/supplier/orders" className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline">
            Manage Orders
          </Link>
        </div>
        <OrderTable orders={recentOrders} />
      </div>

    </div>
  );
}
