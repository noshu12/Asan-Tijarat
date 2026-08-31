"use client";

import React, { useState } from 'react';
import { Order, OrderStatus } from '@/lib/types';
import { formatPKR, formatDate } from '@/lib/utils';
import { printInvoice } from '@/lib/invoice';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Eye, Truck, Download } from 'lucide-react';
import { useToast } from '@/context/ToastContext';

export function OrderTable({
  orders,
  onStatusUpdate
}: {
  orders: Order[];
  onStatusUpdate?: (orderId: string, newStatus: OrderStatus) => void;
}) {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const { showToast } = useToast();

  const getStatusVariant = (status: OrderStatus) => {
    switch (status) {
      case 'Delivered': return 'delivered';
      case 'Shipped': return 'shipped';
      case 'Confirmed': return 'confirmed';
      case 'Pending': return 'pending';
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
                    {order.status}
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
                  {selectedOrder.status}
                </Badge>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">Payment</p>
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  {selectedOrder.paymentMethod} ({selectedOrder.paymentStatus})
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-slate-500">Ordered Products</p>
              {selectedOrder.items.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <img src={item.productImage} alt={item.productName} className="w-12 h-12 rounded-lg object-cover" />
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
              <div className="flex justify-between text-slate-500">
                <span>Platform Escrow Fee (1.5%)</span>
                <span>{formatPKR(selectedOrder.platformFee)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-slate-900 dark:text-white pt-1 border-t">
                <span>Total Amount</span>
                <span className="text-emerald-600 dark:text-emerald-400">{formatPKR(selectedOrder.totalAmount)}</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs">
              <p className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                <Truck className="w-4 h-4" /> Shipping Address
              </p>
              <p className="text-slate-600 dark:text-slate-300 mt-1">{selectedOrder.shippingAddress}</p>
            </div>

            {/* Receipt actions — printable/savable invoice + payment status */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Payment Status:{' '}
                <Badge variant={selectedOrder.paymentStatus === 'Paid' ? 'active' : selectedOrder.paymentStatus === 'Pending' ? 'pending' : 'outline'}>
                  {selectedOrder.paymentStatus}
                </Badge>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const opened = printInvoice(selectedOrder);
                  showToast(
                    opened
                      ? 'Invoice opened — print it or choose "Save as PDF".'
                      : 'Popup blocked! Allow popups to download invoices.',
                    opened ? 'success' : 'error'
                  );
                }}
              >
                <Download className="w-4 h-4" />
                Download Invoice
              </Button>
            </div>

            {onStatusUpdate && selectedOrder.status !== 'Delivered' && (
              <div className="flex gap-2 pt-2">
                {selectedOrder.status === 'Pending' && (
                  <Button
                    onClick={() => {
                      onStatusUpdate(selectedOrder.id, 'Confirmed');
                      setSelectedOrder(null);
                      showToast('Order confirmed by supplier!');
                    }}
                    className="w-full"
                  >
                    Confirm Order
                  </Button>
                )}
                {selectedOrder.status === 'Confirmed' && (
                  <Button
                    onClick={() => {
                      onStatusUpdate(selectedOrder.id, 'Shipped');
                      setSelectedOrder(null);
                      showToast('Order marked as Shipped!');
                    }}
                    className="w-full"
                  >
                    Mark as Shipped
                  </Button>
                )}
                {selectedOrder.status === 'Shipped' && (
                  <Button
                    onClick={() => {
                      onStatusUpdate(selectedOrder.id, 'Delivered');
                      setSelectedOrder(null);
                      showToast('Order marked as Delivered!');
                    }}
                    className="w-full"
                  >
                    Mark as Delivered
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}