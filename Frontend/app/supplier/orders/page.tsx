"use client";

import React, { useState } from 'react';
import { OrderTable } from '@/components/OrderTable';
import { OrderStatus } from '@/lib/types';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { useOrders } from '@/context/OrderContext';

export default function SupplierOrdersPage() {
  const [activeTab, setActiveTab] = useState<'All' | OrderStatus>('All');
  const { user } = useAuth();
  const { orders, updateOrderStatus } = useOrders();
  const { showToast } = useToast();

  const handleStatusUpdate = (orderId: string, newStatus: OrderStatus) => {
    updateOrderStatus(orderId, newStatus);
    showToast(`Order updated to ${newStatus}`, 'success');
  };

  const filteredOrders = activeTab === 'All'
    ? orders.filter((order) => order.supplierId === user?.id)
    : orders.filter((order) => order.supplierId === user?.id && order.status === activeTab);

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-2xl sm:text-3xl font-bold text-asan-dark dark:text-white tracking-tight">
          Received Orders
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Process wholesale orders, dispatch shipments, and release escrow funds
        </p>
      </div>

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

      <OrderTable orders={filteredOrders} onStatusUpdate={handleStatusUpdate} />
    </div>
  );
}
