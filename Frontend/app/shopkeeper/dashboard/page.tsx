"use client";

import React from 'react';
import Link from 'next/link';
import { PortalHeader } from '@/components/PortalHeader';
import { StatsCard } from '@/components/StatsCard';
import { useProducts } from '@/context/ProductContext';
import { useOrders } from '@/context/OrderContext';
import { AIRecommendationCard } from '@/components/AIRecommendationCard';
import { OrderTable } from '@/components/OrderTable';
import { ShoppingCart, CreditCard, Sparkles, TrendingUp, ArrowRight, Store } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function ShopkeeperDashboardPage() {
  const { user } = useAuth();
  const { products } = useProducts();
  const { orders } = useOrders();
  const trendingProducts = products.filter((product) => product.isTrending);
  const recommendedProducts = products.slice(6, 9);
  const recentOrders = orders.filter((order) => order.buyerId === user?.id).slice(0, 3);

  return (
    <div className="space-y-8">
      <PortalHeader
        title="Dashboard"
        subtitle="Thursday, 3 July 2026 • Shopkeeper Portal"
      />

      {/* Welcome Banner matching Figma w4.png */}
      <div className="rounded-3xl bg-gradient-to-r from-asan-dark to-emerald-900 text-white p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div>
          <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            Welcome back, {user?.name || 'M. Hassan'} 👋
          </h2>
          <p className="text-xs sm:text-sm text-emerald-200/80 mt-1">
            Discover <strong className="text-white">12 new wholesale commodities</strong> matching your inventory preferences.
          </p>
        </div>

        <Link
          href="/marketplace"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-asan-accent hover:bg-asan-accent-hover text-white text-xs sm:text-sm font-bold shadow-lg transition shrink-0"
        >
          <Store className="w-4 h-4" />
          <span>Browse Marketplace</span>
        </Link>
      </div>

      {/* Quick KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatsCard
          title="Total Wholesale Orders"
          value="89"
          change="+5.2%"
          isPositive={true}
          icon={ShoppingCart}
        />
        <StatsCard
          title="Total Spent This Year"
          value="Rs 2.1M"
          change="+11%"
          isPositive={true}
          icon={CreditCard}
        />
      </div>

      {/* AI Recommendations Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-asan-accent" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Recommended for You</h3>
            <span className="text-[11px] text-slate-400">Personalized AI picks • updated daily</span>
          </div>
          <Link href="/marketplace" className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1">
            <span>Browse all</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {recommendedProducts.map((product) => (
            <AIRecommendationCard key={product.id} product={product} />
          ))}
        </div>
      </div>

      {/* Today's Trending Searches (Matching Figma w5.png) */}
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-amber-500" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Today&apos;s Trending Commodities in Mandis</h3>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {[
            { rank: 1, name: 'Himalayan Pink Rock Salt (1kg & 50kg)', searches: '4,820 wholesale searches', trend: '+23%' },
            { rank: 2, name: 'Super Kernel Basmati Rice Premium', searches: '3,910 wholesale searches', trend: '+18%' },
            { rank: 3, name: 'Cotton Shirting Fabric Export Weave', searches: '3,240 wholesale searches', trend: '+12%' },
            { rank: 4, name: 'Lahori Steam Red Chilli Powder', searches: '2,780 wholesale searches', trend: '+9%' },
            { rank: 5, name: 'Pure Desi Buffalo Ghee Tins', searches: '2,150 wholesale searches', trend: '+6%' },
          ].map((item) => (
            <div key={item.rank} className="py-3 flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-slate-400 w-4">{item.rank}</span>
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">{item.name}</p>
                  <p className="text-[11px] text-slate-400">{item.searches}</p>
                </div>
              </div>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded">
                {item.trend}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Orders Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Recent Orders</h3>
          <Link href="/shopkeeper/orders" className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline">
            View all
          </Link>
        </div>
        <OrderTable orders={recentOrders} />
      </div>

    </div>
  );
}
