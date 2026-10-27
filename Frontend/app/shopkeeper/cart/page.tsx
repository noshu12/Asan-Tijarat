"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { PortalHeader } from '@/components/PortalHeader';
import { Store, ArrowRight, Trash2, Minus, Plus, Check, MapPin, Crosshair } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthProvider';
import { Order } from '@/lib/types';
import { formatPKR } from '@/lib/utils';
import { getCart, setQuantity, removeFromCart, clearCart } from '@/lib/cart';
import { useDeviceLocation } from '@/lib/useDeviceLocation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Loader } from '@/components/ui/loader';
import { ProductImage } from '@/components/ProductImage';

const PAYMENT_METHODS = ['JazzCash', 'EasyPaisa', 'Card', 'Bank Transfer'] as const;

export default function ShopkeeperCartPage() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState(() => getCart());
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [shippingAddress, setShippingAddress] = useState('Shop 12, Azam Cloth Market, Lahore');
  const [paymentMethod, setPaymentMethod] = useState<'JazzCash' | 'EasyPaisa' | 'Card' | 'Bank Transfer'>('JazzCash');
  const [error, setError] = useState<string | null>(null);
  const [createdOrders, setCreatedOrders] = useState<Order[] | null>(null);
  const {
    coords,
    locating,
    notice: locationNotice,
    capture: captureLocation,
    autoPrompt: autoPromptLocation,
  } = useDeviceLocation();

  useEffect(() => {
    if (authLoading) return;
    setError(null);
  }, [authLoading]);

  const refresh = () => setItems(getCart());

  const subtotal = items.reduce((sum, entry) => sum + entry.product.price * entry.quantity, 0);
  const escrowFee = Math.round(subtotal * 0.015);
  const grandTotal = subtotal + escrowFee;

  const handleCheckout = async () => {
    if (!user || items.length === 0) return;
    if (!shippingAddress.trim()) { setError('Shipping address is required.'); return; }
    setError(null);
    setCheckoutLoading(true);
    try {
      const location = coords ?? user?.currentLocation ?? undefined;
      const res = await api.createOrder({
        items: items.map((entry) => ({ productId: entry.product.id, quantity: entry.quantity })),
        shippingAddress: shippingAddress.trim(),
        paymentMethod,
        currentLocation: location ? { lat: location.lat, lng: location.lng } : undefined,
      });
      clearCart();
      setCreatedOrders(res.orders);
      setItems([]);
      setCheckoutOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed. Please try again.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const openCheckout = () => {
    setCheckoutOpen(true);
    autoPromptLocation();
  };

  const locationPreviewUrl = coords
    ? `https://www.google.com/maps?q=${coords.lat},${coords.lng}`
    : null;

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Sign in to view your cart</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">Sign in with a shopkeeper account to view your cart.</p>
        <Link
          href="/signin"
          className="inline-flex items-center gap-2 mt-5 px-5 py-2.5 rounded-xl bg-asan-accent hover:bg-asan-accent-hover text-white text-xs font-bold shadow-md transition"
        >
          <span>Sign In</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PortalHeader
        title="Shopping Cart"
        subtitle="Shopkeeper Portal • cart is saved on this device until checkout"
      />
      {error && (
        <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-700 dark:text-red-300">
          ⚠️ {error}
        </div>
      )}
      {createdOrders && createdOrders.length > 0 && (
        <div className="p-6 rounded-3xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 shadow-sm">
          <div className="flex items-center gap-3">
            <Check className="w-6 h-6 text-emerald-600 shrink-0" />
            <div>
              <h3 className="text-base font-bold text-emerald-800 dark:text-emerald-300">
                Order placed successfully! 🎉
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                {createdOrders.length} order{createdOrders.length > 1 ? 's' : ''} saved to MongoDB —{' '}
                {createdOrders.map((o) => o.orderNumber).join(', ')} · total {formatPKR(grandTotal)}.
                The supplier will confirm, ship and deliver your lot
                {createdOrders.some((o) => o.buyerLocationLink)
                  ? ' using the shop location link shared with your order.'
                  : '.'}
              </p>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Link
              href="/shopkeeper/orders"
              className="px-4 py-2 rounded-xl bg-asan-accent hover:bg-asan-accent-hover text-white text-xs font-bold shadow transition"
            >
              View My Orders
            </Link>
            <button
              type="button"
              onClick={() => setCreatedOrders(null)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition"
            >
              Keep Browsing
            </button>
          </div>
        </div>
      )}
      {items.length === 0 && !createdOrders && (
        <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8">
          <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center mx-auto text-asan-accent mb-4">
            <Store className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Your wholesale cart is empty</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Browse the marketplace to find verified commodities, then add them at wholesale quantities.
          </p>
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 mt-5 px-5 py-2.5 rounded-xl bg-asan-accent hover:bg-asan-accent-hover text-white text-xs font-bold shadow-md transition"
          >
            <span>Browse Marketplace</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}
      {items.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
              Cart Items ({items.length})
            </h3>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((entry) => (
                <div key={entry.product.id} className="flex items-center justify-between gap-4 py-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <ProductImage src={entry.product.image} alt={entry.product.name} className="w-14 h-14 rounded-lg object-cover shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{entry.product.name}</p>
                      <p className="text-[11px] text-slate-400">
                        {formatPKR(entry.product.price)} / {entry.product.unit} · MOQ {entry.product.moq}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      onClick={() => { setQuantity(entry.product.id, entry.quantity - 1); refresh(); }}
                      className="w-8 h-8 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="min-w-10 text-center text-sm font-bold">{entry.quantity}</span>
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      onClick={() => { setQuantity(entry.product.id, entry.quantity + 1); refresh(); }}
                      className="w-8 h-8 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Remove item"
                      onClick={() => { removeFromCart(entry.product.id); refresh(); }}
                      className="ml-2 p-2 rounded-lg text-red-500 hover:bg-red-50 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm h-fit">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">Order Summary</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal</span>
                <span>{formatPKR(subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Platform Escrow Fee (1.5%)</span>
                <span>{formatPKR(escrowFee)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-slate-900 dark:text-white pt-2 border-t">
                <span>Grand Total</span>
                <span className="text-emerald-600 dark:text-emerald-400">{formatPKR(grandTotal)}</span>
              </div>
            </div>
            <Button type="button" className="w-full mt-5" onClick={openCheckout}>
              Proceed to Checkout
            </Button>
            <p className="text-[11px] text-slate-400 mt-2">Escrow protects your payment until the order is delivered.</p>
          </div>
        </div>
      )}
      <Modal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        title="Confirm Wholesale Order"
        description="Your order is placed against live stock in MongoDB — quantities below MOQ will be rejected."
      >
        <form
          onSubmit={(e) => { e.preventDefault(); void handleCheckout(); }}
          className="space-y-4"
        >
          <Input
            label="Shipping Address"
            value={shippingAddress}
            onChange={(e) => setShippingAddress(e.target.value)}
            placeholder="Shop / warehouse address"
            required
          />
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-asan-accent" />
              Shop Location (for delivery)
            </p>
            {locating && (
              <p className="text-xs text-slate-500 flex items-center gap-2">
                <Loader /> Detecting your current location…
              </p>
            )}
            {coords && locationPreviewUrl && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-slate-600 dark:text-slate-300 font-mono">
                  📍 {coords.lat}, {coords.lng}
                </p>
                <a
                  href={locationPreviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  <MapPin className="w-3 h-3" />
                  Preview in Google Maps
                </a>
              </div>
            )}
            {locationNotice && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">{locationNotice}</p>
            )}
            {!coords && !locating && !locationNotice && (
              <p className="text-[11px] text-slate-400">
                {user?.currentLocation
                  ? `Your saved location (${user?.currentLocation.lat}, ${user?.currentLocation.lng}) will be shared. Capture a fresh point to update it.`
                  : 'Capture your live location so the supplier receives a Google Maps link to your shop for delivery.'}
              </p>
            )}
            <button
              type="button"
              onClick={captureLocation}
              disabled={locating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-asan-dark hover:bg-asan-mid disabled:opacity-60 text-white text-[11px] font-bold transition"
            >
              <Crosshair className="w-3 h-3" />
              {coords ? 'Recapture my current location' : 'Use my current location'}
            </button>
            {!coords && !user?.currentLocation && !locating && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                ⚠ No location available — the supplier will only see the written shipping address.
              </p>
            )}
          </div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Payment Method
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as 'JazzCash' | 'EasyPaisa' | 'Card' | 'Bank Transfer')}
              className="w-full h-11 px-4 mt-1 rounded-xl border border-slate-200 bg-white dark:bg-slate-900 text-sm dark:text-white focus:border-asan-accent focus:outline-none focus:ring-2 focus:ring-asan-accent/20"
            >
              {PAYMENT_METHODS.map((method) => <option key={method}>{method}</option>)}
            </select>
          </label>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3 text-xs space-y-1">
            <div className="flex justify-between text-slate-500">
              <span>{items.length} item(s)</span>
              <span className="font-bold text-slate-900 dark:text-white">{formatPKR(grandTotal)}</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Includes 1.5% escrow fee · payment status will be marked Paid on confirmation.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Button type="button" variant="outline" onClick={() => setCheckoutOpen(false)}>Cancel</Button>
            <Button type="submit" isLoading={checkoutLoading}>Place Order</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
