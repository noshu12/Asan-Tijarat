"use client";

import React, { useState, useEffect } from 'react';
import { Product } from '@/lib/types';
import { formatPKR } from '@/lib/utils';
import { MapPin, Minus, Plus, Check, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ProductImage } from '@/components/ProductImage';
import { Modal } from '@/components/ui/modal';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthProvider';
import { addToCart } from '@/lib/cart';
import { API_URL } from '@/lib/api';

type MarketSale = {
  productId: string;
  days: number;
  bagsSold: number;
  shopkeepers: number;
};

/**
 * Turns the product's free-text unit into buyer-friendly pack lines.
 *
 * The Product model has no separate pack-weight field — the weight lives
 * inside the unit string the supplier typed (e.g. "25 kg", "50kg bag").
 * Rules, with nothing invented:
 * - Weight = the first number + kg/g/litre found in the unit, if any.
 * - Pack noun = a pack word found in the unit (bag/carton/tin/box/drum/
 *   pack/sack), else "bag" when a weight exists (one unit is one bag),
 *   else the unit itself (e.g. "kg", "piece").
 * - The "1 pack = weight" line is shown ONLY when a weight was parsed.
 */
function parsePack(unit: string): { pack: string; weight: string | null } {
  const text = (unit || '').trim();
  const weightMatch = text.match(/(\d+(?:\.\d+)?)\s*(kg|g|litre|litres|l|ml)\b/i);
  const weight = weightMatch
    ? `${weightMatch[1]} ${weightMatch[2].toLowerCase().startsWith('lit') ? 'litre' : weightMatch[2].toLowerCase()}`
    : null;
  const nounMatch = text.match(/\b(bag|carton|tin|box|drum|pack|packet|sack|crate|bottle|jar)\b/i);
  if (nounMatch) return { pack: nounMatch[1].toLowerCase(), weight };
  if (weight) return { pack: 'bag', weight };
  return { pack: text || 'unit', weight: null };
}

export function ProductCard({ product }: { product: Product }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [added, setAdded] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [qty, setQty] = useState(Math.max(product.moq, 1));
  const [popupAdded, setPopupAdded] = useState(false);
  const [marketSale, setMarketSale] = useState<MarketSale | null>(null);
  const canBuy = !authLoading && (!user || user.role === 'shopkeeper');
  const { pack, weight } = parsePack(product.unit);
  const stock = product.stock ?? 0;
  const outOfStock = stock <= 0 || product.status === 'Out of Stock';

  // Market-sale box: fetched only when the popup opens, from real
  // delivered orders. On any failure the box simply stays hidden —
  // it must never show a guessed or fake number.
  useEffect(() => {
    if (!showDetail) return;
    let cancelled = false;
    fetch(`${API_URL}/api/products/${product.id}/market-sale`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setMarketSale(data);
      })
      .catch(() => {
        if (!cancelled) setMarketSale(null);
      });
    return () => {
      cancelled = true;
    };
  }, [showDetail, product.id]);

  const handleAdd = (e?: React.MouseEvent) => {
    // Guests are bounced to sign-in; suppliers manage listings from their portal.
    // stopPropagation keeps the quick Add from opening the detail popup.
    e?.stopPropagation();
    if (authLoading) return;
    if (!user) {
      router.push('/signin?redirect=/marketplace');
      return;
    }
    if (user.role !== 'shopkeeper') return;
    addToCart(product);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1400);
  };

  const handlePopupAdd = () => {
    if (authLoading) return;
    if (!user) {
      router.push('/signin?redirect=/marketplace');
      return;
    }
    if (user.role !== 'shopkeeper') return;
    addToCart(product, qty);
    setPopupAdded(true);
    window.setTimeout(() => setPopupAdded(false), 1400);
  };

  const clampQty = (value: number) => {
    const floor = Math.max(product.moq, 1);
    const ceil = Math.max(stock, floor);
    return Math.min(Math.max(Math.floor(value) || floor, floor), ceil);
  };

  return (
    <>
      <motion.div
        whileHover={{ y: -4 }}
        transition={{ duration: 0.2 }}
        className="group rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm hover:shadow-xl dark:border-slate-800 dark:bg-slate-900 transition-all flex flex-col justify-between"
      >
        <div>
          <button
            type="button"
            onClick={() => setShowDetail(true)}
            title={`View ${product.name} details`}
            className="relative block aspect-square w-full overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800 cursor-pointer text-left"
          >
            <ProductImage
              src={product.image}
              alt={product.name}
              className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            {product.status === 'Low Stock' && (
              <div className="absolute top-2.5 right-2.5">
                <Badge variant="warning">Low Stock</Badge>
              </div>
            )}
          </button>

          <div className="mt-3 space-y-1">
            <button
              type="button"
              onClick={() => setShowDetail(true)}
              className="block text-left"
            >
              <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white line-clamp-2 leading-snug hover:text-emerald-600 transition">
                {product.name}
              </h3>
            </button>

            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="truncate">{product.supplierName}</span>
              <span>•</span>
              <span className="flex items-center gap-0.5 shrink-0">
                <MapPin className="w-3 h-3 text-slate-400" />
                {product.supplierCity}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
          <div>
            <div className="text-base sm:text-lg font-extrabold text-asan-dark dark:text-emerald-400 leading-none">
              {formatPKR(product.price)} / {pack}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Min: {product.moq} {pack}
            </div>
            {weight && (
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                1 {pack} = {weight}
              </div>
            )}
          </div>

          {canBuy ? (
            <button
              type="button"
              onClick={handleAdd}
              aria-label={`Add ${product.name} to cart`}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-md shadow-emerald-700/20 active:scale-95 transition ${
                added
                  ? 'bg-emerald-600 text-white'
                  : 'bg-asan-accent hover:bg-asan-accent-hover text-white'
              }`}
            >
              {added ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              <span>{added ? 'Added' : 'Add'}</span>
            </button>
          ) : (
            <span className="text-[11px] font-medium text-slate-400 px-3 py-1.5">
              Supplier listing
            </span>
          )}
        </div>
      </motion.div>

      <Modal
        isOpen={showDetail}
        onClose={() => setShowDetail(false)}
        maxWidth="max-w-3xl"
        title={product.name}
        description={`${product.supplierName} • ${product.supplierCity}`}
      >
        <div className="space-y-4">
          <div className="relative w-full overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
            <ProductImage
              src={product.image}
              alt={product.name}
              className="w-full max-h-[45vh] object-contain"
            />
            {product.status === 'Low Stock' && (
              <div className="absolute top-2.5 right-2.5">
                <Badge variant="warning">Low Stock</Badge>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {product.category}
            </p>
            {product.description && (
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {product.description}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Price</p>
              <p className="text-sm font-extrabold text-asan-dark dark:text-emerald-400 mt-1">
                {formatPKR(product.price)} / {pack}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Minimum order</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                {product.moq} {pack}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pack size</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                {weight ? `1 ${pack} = ${weight}` : product.unit}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Stock</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                {stock} {pack}
              </p>
            </div>
          </div>

          {marketSale && marketSale.bagsSold > 0 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Market sale — last 30 days
              </p>
              <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                {marketSale.bagsSold} {pack}{marketSale.bagsSold === 1 ? '' : 's'} sold to{' '}
                {marketSale.shopkeepers} shopkeeper{marketSale.shopkeepers === 1 ? '' : 's'}
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Decrease quantity"
                disabled={outOfStock || qty <= Math.max(product.moq, 1)}
                onClick={() => setQty((q) => clampQty(q - 1))}
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-40"
              >
                <Minus className="w-4 h-4" />
              </button>
              <input
                type="number"
                min={Math.max(product.moq, 1)}
                max={stock}
                value={qty}
                disabled={outOfStock}
                onChange={(e) => setQty(clampQty(Number(e.target.value)))}
                className="w-20 h-10 text-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-bold dark:text-white focus:outline-none"
              />
              <button
                type="button"
                aria-label="Increase quantity"
                disabled={outOfStock || qty >= stock}
                onClick={() => setQty((q) => clampQty(q + 1))}
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-40"
              >
                <Plus className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {pack} · Total: <span className="font-extrabold text-asan-dark dark:text-emerald-400">{formatPKR(product.price * qty)}</span>
              </span>
            </div>

            <div className="sm:ml-auto">
              {canBuy ? (
                <button
                  type="button"
                  disabled={outOfStock}
                  onClick={handlePopupAdd}
                  className={`flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold shadow-md shadow-emerald-700/20 transition ${
                    popupAdded
                      ? 'bg-emerald-600 text-white'
                      : 'bg-asan-accent hover:bg-asan-accent-hover text-white'
                  } disabled:opacity-40`}
                >
                  {popupAdded ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  <span>{outOfStock ? 'Out of stock' : popupAdded ? 'Added to cart' : 'Add to Cart'}</span>
                </button>
              ) : (
                <span className="text-xs font-medium text-slate-400">
                  Only shopkeepers can purchase
                </span>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
