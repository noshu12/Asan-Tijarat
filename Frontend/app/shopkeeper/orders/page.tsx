"use client";

import React, { useState } from 'react';
import { PortalHeader } from '@/components/PortalHeader';
import { OrderTable } from '@/components/OrderTable';
import { OrderStatus } from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import { useOrders } from '@/context/OrderContext';

export default function ShopkeeperOrdersPage() {
  const [activeTab, setActiveTab] = useState<'All' | OrderStatus>('All');
  const { user } = useAuth();
  const { orders } = useOrders();
  const userOrders = orders.filter((order) => order.buyerId === user?.id);

  const filteredOrders = activeTab === 'All'
    ? userOrders
    : userOrders.filter((order) => order.status === activeTab);

  return (
    <div className="space-y-6">
      <PortalHeader
        title="My Orders"
        subtitle="Thursday, 3 July 2026 • Shopkeeper Portal"
      />

      {/* Filter Tabs matching Figma w8.png */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {(['All', 'Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === tab
                ? 'bg-asan-dark text-white shadow-md'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <OrderTable orders={filteredOrders} />
    </div>
  );
}
