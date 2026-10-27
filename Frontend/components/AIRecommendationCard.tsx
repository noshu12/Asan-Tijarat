"use client";

import React, { useState } from 'react';
import { Product } from '@/lib/types';
import { formatPKR } from '@/lib/utils';
import { Sparkles, Plus, Check } from 'lucide-react';
import { ProductImage } from '@/components/ProductImage';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthProvider';
import { addToCart } from '@/lib/cart';

export function AIRecommendationCard({ product }: { product: Product }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [added, setAdded] = useState(false);

  const handleAdd = () => {
    if (authLoading) return;
    if (!user) {
      router.push('/signin?redirect=/shopkeeper/dashboard');
      return;
    }
    if (user.role !== 'shopkeeper') return;
    addToCart(product);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1400);
  };

  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-emerald-50/50 to-white dark:from-emerald-950/20 dark:to-slate-900 p-4 shadow-sm hover:shadow-md transition">
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 mb-3 bg-emerald-100/70 dark:bg-emerald-900/40 px-2.5 py-1 rounded-full w-fit">
        <Sparkles className="w-3.5 h-3.5" />
        <span>{product.aiReason || 'AI Recommendation'}</span>
      </div>

      <div className="flex gap-3.5">
        <ProductImage
          src={product.image}
          alt={product.name}
          className="w-20 h-20 rounded-xl object-cover shrink-0 border border-slate-100 dark:border-slate-800"
        />
        <div className="flex flex-col justify-between flex-1 min-w-0">
          <div>
            <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
              {product.name}
            </h4>
            <p className="text-[11px] text-slate-400 truncate">{product.supplierName}</p>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="font-extrabold text-sm text-asan-dark dark:text-emerald-400">
              {formatPKR(product.price)}
            </span>
            <button
              type="button"
              onClick={handleAdd}
              title="Add to Cart"
              aria-label={`Add ${product.name} to cart`}
              className={added
                ? 'p-1.5 rounded-lg bg-emerald-600 text-white transition'
                : 'p-1.5 rounded-lg bg-asan-accent hover:bg-asan-accent-hover text-white transition'}
            >
              {added ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}