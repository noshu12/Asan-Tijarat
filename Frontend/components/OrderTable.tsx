"use client";

import React, { useState } from 'react';
import { Order, OrderStatus } from '@/lib/types';
import { formatPKR, formatDate, orderGoogleMapsUrl } from '@/lib/utils';
import { printInvoice } from '@/lib/invoice';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { ProductImage } from '@/components/ProductImage';
import { Eye, Truck, Download, MapPin, Navigation } from 'lucide-react';

const statusLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function OrderTable({ orders }: { orders: Order[] }) {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const getStatusVariant = (status: OrderStatus) => {
    switch (status) {
      case 'delivered': return 'delivered';
      case 'shipped': return 'shipped';
      case 'confirmed': return 'confirmed';
      case 'pending': return 'pending';
      default: return 'outline';
    }
  };

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="px-5 py-3.5">Order ID</th>
              <th className="px-5 py-3.5">Party / Product</th>
              <th className="px-5 py-3.5">Amount</th>
              <th className="px-5 py-3.5">Status</th>
              <th className="px-5 py-3.5">Date</th>
              <th className="px-5 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {orders.map((order) => (
              <tr key={order.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                <td className="px-5 py-4 font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                  {order.orderNumber}
                </td>
                <td className="px-5 py-4">
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {order.items[0]?.productName || 'Wholesale Goods'}
                  </div>
                  <div className="text-xs text-slate-400">
                    Buyer: {order.buyerName} • Supplier: {order.supplierName}
                  </div>
                </td>
                <td className="px-5 py-4 font-bold text-slate-900 dark:text-white">
                  {formatPKR(order.totalAmount)}
                </td>
                <td className="px-5 py-4">
                  <Badge variant={getStatusVariant(order.status)}>
                    {statusLabel(order.status)}
                  </Badge>
                </td>
                <td className="px-5 py-4 text-xs text-slate-500 dark:text-slate-400">
                  {formatDate(order.createdAt)}
                </td>
                <td className="px-5 py-4 text-right">
                  <button
                    onClick={() => setSelectedOrder(order)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-asan-dark hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    title="View Order Details"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        title={`Order Details: ${selectedOrder?.orderNumber}`}
        description="Complete breakdown of wholesale transaction"
        maxWidth="max-w-xl"
      >
        {selectedOrder && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <div>
                <p className="text-xs text-slate-400">Status</p>
                <Badge variant={getStatusVariant(selectedOrder.status)} className="mt-1">
                  {statusLabel(selectedOrder.status)}
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-slate-500">Ordered Products</p>
              {selectedOrder.items.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <ProductImage src={item.productImage} alt={item.productName} className="w-12 h-12 rounded-lg object-cover" />
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">{item.productName}</p>
                      <p className="text-[11px] text-slate-400">{item.quantity} x {formatPKR(item.unitPrice)} / {item.unit}</p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {formatPKR(item.unitPrice * item.quantity)}
                  </p>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal</span>
                <span>{formatPKR(selectedOrder.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-slate-900 dark:text-white pt-1 border-t">
                <span>Total Amount</span>
                <span className="text-emerald-600 dark:text-emerald-400">{formatPKR(selectedOrder.totalAmount)}</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs space-y-2">
              <div>
                <p className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <Truck className="w-4 h-4" /> Shipping Address
                </p>
                <p className="text-slate-600 dark:text-slate-300 mt-1">{selectedOrder.shippingAddress}</p>
              </div>

              {/* Buyer's delivery location — tapping the link opens Google
                  Maps at the shopkeeper's exact GPS point for navigation. */}
              {(() => {
                const mapsUrl = orderGoogleMapsUrl(selectedOrder);
                if (!mapsUrl) return null;
                const hasGps = Boolean(selectedOrder.buyerLocation);
                return (
                  <div className="pt-2 border-t border-emerald-200 dark:border-emerald-800">
                    <p className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                      <MapPin className="w-4 h-4" /> Shopkeeper&apos;s Live Location
                    </p>
                    {hasGps && selectedOrder.buyerLocation && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                        📍 {selectedOrder.buyerLocation.lat}, {selectedOrder.buyerLocation.lng}
                      </p>
                    )}
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition"
                      title="Opens Google Maps at the shopkeeper's exact location"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      Open in Google Maps &amp; Navigate
                    </a>
                  </div>
                );
              })()}
            </div>

            {/* Receipt actions — printable/savable invoice */}
            <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => printInvoice(selectedOrder)}
              >
                <Download className="w-4 h-4" />
                Download Invoice
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
