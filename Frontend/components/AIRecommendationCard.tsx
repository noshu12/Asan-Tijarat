"use client";

import React from 'react';
import { Product } from '@/lib/types';
import { formatPKR } from '@/lib/utils';
import { useCart } from '@/context/CartContext';
import { Sparkles, Plus } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useRouter } from 'next/navigation';

export function AIRecommendationCard({ product }: { product: Product }) {
  const { addToCart } = useCart();
  const { user, isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  /** Same auth funnel as ProductCard — AI picks never bypass sign-in. */
  const handleAddToCart = () => {
    if (!isAuthenticated || !user) {
      showToast('Please sign in as a Shopkeeper to add items to your cart.', 'info');
      router.push('/signin?redirect=%2Fmarketplace');
      return;
    }
    addToCart(product, product.moq);
  };

  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-emerald-50/50 to-white dark:from-emerald-950/20 dark:to-slate-900 p-4 shadow-sm hover:shadow-md transition">
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 mb-3 bg-emerald-100/70 dark:bg-emerald-900/40 px-2.5 py-1 rounded-full w-fit">
        <Sparkles className="w-3.5 h-3.5" />
        <span>{product.aiReason || 'AI Recommendation'}</span>
      </div>

      <div className="flex gap-3.5">
        <img
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
              onClick={handleAddToCart}
              className="p-1.5 rounded-lg bg-asan-accent hover:bg-asan-accent-hover text-white transition"
              title="Add to Cart"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}