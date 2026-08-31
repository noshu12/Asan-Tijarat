"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { PortalHeader } from '@/components/PortalHeader';
import { useCart } from '@/context/CartContext';
import { formatPKR } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { useOrders } from '@/context/OrderContext';
import { Trash2, Plus, Minus, ShieldCheck, ArrowRight, Store, CheckCircle2 } from 'lucide-react';
import confetti from 'canvas-confetti';

/**
 * 🛒 SHARED CART VIEW — Shopkeeper Portal entry point:
 *   app/shopkeeper/cart/page.tsx  ("…Shopkeeper Portal")
 * Presentational only — all state/maths live in CartContext & OrderContext.
 */
export function CartView({ subtitle }: { subtitle: string }) {
  const { items, updateQuantity, removeFromCart, clearCart, subtotal, platformFee, total } = useCart();
  const { user } = useAuth();
  const { placeOrders } = useOrders();
  const { showToast } = useToast();
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'JazzCash' | 'EasyPaisa' | 'Card'>('JazzCash');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleCheckout = (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);

    setTimeout(() => {
      if (!user) {
        setIsProcessing(false);
        showToast('Please sign in before checking out.', 'error');
        return;
      }
      setIsProcessing(false);
      setCheckoutModalOpen(false);
      placeOrders(user, items, paymentMethod, 'Plot 45, Jodia Bazaar, Karachi');
      clearCart();

      try {
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.6 }
        });
      } catch (err) {}

      showToast(`Payment of ${formatPKR(total)} confirmed via ${paymentMethod}! Wholesale order placed.`, 'success');
    }, 1500);
  };

  return (
    <div className="space-y-8">
      <PortalHeader
        title="Shopping Cart"
        subtitle={subtitle}
      />

      {items.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8">
          <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center mx-auto text-asan-accent mb-4">
            <Store className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Your wholesale cart is empty</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Browse the marketplace to find verified agricultural commodities and factory goods.
          </p>
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 mt-5 px-5 py-2.5 rounded-xl bg-asan-accent hover:bg-asan-accent-hover text-white text-xs font-bold shadow-md transition"
          >
            <span>Browse Marketplace</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          {/* Cart Items List */}
          <div className="lg:col-span-2 space-y-4">
            {items.map((item) => (
              <div
                key={item.product.id}
                className="p-5 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4">
                  <img
                    src={item.product.image}
                    alt={item.product.name}
                    className="w-20 h-20 rounded-2xl object-cover border border-slate-100 dark:border-slate-800"
                  />
                  <div>
                    <h4 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                      {item.product.name}
                    </h4>
                    <p className="text-xs text-slate-500">{item.product.supplierName}</p>
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
                      {formatPKR(item.product.price)} / {item.product.unit}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between w-full sm:w-auto gap-6">
                  {/* Quantity Counter */}
                  <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                    <button
                      onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                      className="p-1 rounded-lg bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 transition"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-bold text-xs px-2 text-slate-900 dark:text-white">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                      className="p-1 rounded-lg bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Total for Item */}
                  <div className="text-right">
                    <p className="text-base font-extrabold text-slate-900 dark:text-white">
                      {formatPKR(item.product.price * item.quantity)}
                    </p>
                    <button
                      onClick={() => removeFromCart(item.product.id)}
                      className="text-[11px] text-red-500 hover:underline font-medium mt-0.5"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Order Summary (Matching Figma w6.png) */}
          <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Order Summary</h3>

            <div className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="font-semibold text-slate-900 dark:text-white">{formatPKR(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Platform Escrow Fee (1.5%)</span>
                <span className="font-semibold text-slate-900 dark:text-white">{formatPKR(platformFee)}</span>
              </div>
              <div className="flex justify-between">
                <span>Wholesale Delivery</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">FREE</span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center text-sm font-extrabold">
              <span>Total</span>
              <span className="text-lg text-emerald-600 dark:text-emerald-400">{formatPKR(total)}</span>
            </div>

            <Button
              onClick={() => setCheckoutModalOpen(true)}
              className="w-full h-12 text-sm font-bold mt-2"
            >
              <span>Proceed to Checkout</span>
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>

            <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 pt-2">
              <ShieldCheck className="w-4 h-4 text-asan-accent" />
              <span>100% Escrow Protected Trade</span>
            </div>
          </div>

        </div>
      )}

      {/* Checkout confirmation modal */}
      <Modal
        isOpen={checkoutModalOpen}
        onClose={() => setCheckoutModalOpen(false)}
        title="Confirm Wholesale Order"
        description="Your payment is held safely in Asan Tijarat Escrow until delivery is confirmed."
        maxWidth="max-w-md"
      >
        <form onSubmit={handleCheckout} className="space-y-5">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs">
            <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-asan-accent" /> Deliver To
            </p>
            <p className="text-slate-600 dark:text-slate-300 mt-1">Plot 45, Jodia Bazaar, Karachi</p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Payment Method
            </p>
            {(['JazzCash', 'EasyPaisa', 'Card'] as const).map((method) => (
              <label
                key={method}
                className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                  paymentMethod === method
                    ? 'border-asan-accent bg-emerald-50 dark:bg-emerald-950/40'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <span className="text-sm font-semibold text-slate-900 dark:text-white">{method}</span>
                <input
                  type="radio"
                  name="paymentMethod"
                  value={method}
                  checked={paymentMethod === method}
                  onChange={() => setPaymentMethod(method)}
                  className="h-4 w-4 accent-asan-accent"
                />
              </label>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center text-sm font-extrabold">
            <span className="text-slate-900 dark:text-white">Total (Escrow)</span>
            <span className="text-lg text-emerald-600 dark:text-emerald-400">{formatPKR(total)}</span>
          </div>

          <Button type="submit" isLoading={isProcessing} disabled={items.length === 0} className="w-full h-11">
            Pay {formatPKR(total)} via {paymentMethod}
          </Button>
        </form>
      </Modal>
    </div>
  );
}