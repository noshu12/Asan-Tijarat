"use client";

import React from 'react';
import { useParams } from 'next/navigation';
import { PortalHeader } from '@/components/PortalHeader';
import { OrderDetail } from '@/components/OrderDetail';
import { useAuth } from '@/context/AuthProvider';
import { Loader } from '@/components/ui/loader';

/** Batch 05 — one order, with payment, delivery proof, chat, dispute + rating. */
export default function SupplierOrderDetailPage() {
  const params = useParams();
  const { loading: authLoading } = useAuth();
  const orderId = typeof params.id === 'string' ? params.id : '';

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader />
      </div>
    );
  }

  if (!orderId) {
    return <p className="text-sm text-slate-500">Order not found.</p>;
  }

  return (
    <div className="space-y-6">
      <PortalHeader title="Order Details" subtitle="Supplier Portal" />
      <OrderDetail orderId={orderId} role="supplier" />
    </div>
  );
}
