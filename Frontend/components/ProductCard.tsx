"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { Product } from '@/lib/types';
import { formatPKR } from '@/lib/utils';
import { MapPin, Plus, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ProductImage } from '@/components/ProductImage';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthProvider';
import { addToCart } from '@/lib/cart';
import { trackAddToCart } from '@/lib/analytics';

/**
 * Turns the product's free-text unit into buyer-friendly pack lines.
 * Exported so the product detail page (/product/[id]) parses packs the
 * exact same way as the cards — one source of truth, no drift.
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
export function parsePack(unit: string): { pack: string; weight: string | null } {
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

export function ProductCard({ product, isNew }: { product: Product; isNew?: boolean }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [added, setAdded] = useState(false);
  const canBuy = !authLoading && (!user || user.role === 'shopkeeper');
  const { pack, weight } = parsePack(product.unit);
  const stock = product.stock ?? 0;
  const outOfStock = stock <= 0 || product.status === 'Out of Stock';

  const handleAdd = (e?: React.MouseEvent) => {
    // Guests are bounced to sign-in; suppliers manage listings from their portal.
    e?.stopPropagation();
    if (authLoading) return;
    if (!user) {
      router.push('/signin?redirect=/marketplace');
      return;
    }
    if (user.role !== 'shopkeeper') return;
    addToCart(product);
    // Batch 16 — B8 GA4: card adds the MOQ by default (lib/cart), so the
    // event reports the same quantity. Stock 0 pe addToCart kuch nahi
    // karta, is liye event bhi tabhi fire hota hai jab add waqai hua ho.
    // Batch 20 (audit (d)-2) — the quantity is ALSO capped at stock:
    // addToCart caps the real quantity at stock (lib/cart), so stock 2 /
    // MOQ 5 used to put 2 in the cart but report 5 to GA4.
    if (product.stock > 0) trackAddToCart(product.id, Math.min(Math.max(product.moq, 1), product.stock));
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1400);
  };

  return (
      // FIX (New audit #19) — the old motion.div only did whileHover y:-4
      // (0.2s). Same lift via CSS: hover:-translate-y-1 + duration-200.
      <div
        className="group rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm hover:shadow-xl dark:border-slate-800 dark:bg-slate-900 transition-all duration-200 hover:-translate-y-1 flex flex-col justify-between"
      >
        <div>
          <Link
            href={`/product/${product.id}`}
            title={`View ${product.name} details`}
            className="relative block aspect-square w-full overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800 cursor-pointer text-left"
          >
            <ProductImage
              src={product.image}
              alt={product.name}
              className="h-full w-full"
              imgClassName="object-cover group-hover:scale-105 transition-transform duration-300"
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
            />
            {isNew && (
              <div className="absolute top-2.5 left-2.5">
                <Badge variant="confirmed">New</Badge>
              </div>
            )}
            {product.status === 'Low Stock' && (
              <div className="absolute top-2.5 right-2.5">
                <Badge variant="warning">Low Stock</Badge>
              </div>
            )}
          </Link>

          <div className="mt-3 space-y-1">
            <Link href={`/product/${product.id}`} className="block text-left">
              <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white line-clamp-2 leading-snug hover:text-asan-accent transition">
                {product.name}
              </h3>
            </Link>

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
            <div className="text-base sm:text-lg font-extrabold text-asan-dark dark:text-asan-accent-light leading-none">
              {formatPKR(product.price)} / {pack}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Min: {product.moq} {pack}
            </div>
            {weight && (
              <div className="text-xs text-slate-500 dark:text-slate-400">
                1 {pack} = {weight}
              </div>
            )}
          </div>

          {canBuy ? (
            <button
              type="button"
              onClick={handleAdd}
              aria-label={`Add ${product.name} to cart`}
              // Batch 13 (B3 top-up) — Add button was min-h-[40px]; the audit
              // expects a 44px tap target.
              className={`flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold shadow-md shadow-asan-accent-hover/20 active:scale-95 transition ${
                added
                  ? 'bg-asan-accent text-white'
                  : 'bg-asan-accent hover:bg-asan-accent-hover text-white'
              }`}
            >
              {added ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              <span>{added ? 'Added' : 'Add'}</span>
            </button>
          ) : (
            <span className="text-xs font-medium text-slate-400 px-3 py-1.5">
              Supplier listing
            </span>
          )}
        </div>
      </div>
  );
}
