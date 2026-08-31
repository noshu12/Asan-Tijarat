"use client";

import React from 'react';
import { Product } from '@/lib/types';
import { formatPKR, cn } from '@/lib/utils';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { Star, ShieldCheck, MapPin, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useToast } from '@/context/ToastContext';

export function ProductCard({ product }: { product: Product }) {
  const { addToCart } = useCart();
  const { user, isAuthenticated, role } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  /**
   * Auth funnel for every catalogue "Add" action.
   * Guests never touch CartContext/localStorage — they get warned and routed
   * to sign-in with a post-login bounce back to the marketplace.
   */
  const handleAddToCart = () => {
    if (!isAuthenticated || !user) {
      showToast('Please sign in as a Shopkeeper to add items to your cart.', 'info');
      router.push('/signin?redirect=%2Fmarketplace');
      return;
    }
    addToCart(product, product.moq);
  };

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="group rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm hover:shadow-xl dark:border-slate-800 dark:bg-slate-900 transition-all flex flex-col justify-between"
    >
      <div>
        <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
          <img
            src={product.image}
            alt={product.name}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          {product.supplierVerified && (
            <div className="absolute top-2.5 left-2.5">
              <Badge variant="verified" className="shadow-md">
                <ShieldCheck className="w-3.5 h-3.5" />
                Verified
              </Badge>
            </div>
          )}
          {product.status === 'Low Stock' && (
            <div className="absolute top-2.5 right-2.5">
              <Badge variant="warning">Low Stock</Badge>
            </div>
          )}
        </div>

        <div className="mt-3 space-y-1">
          <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white line-clamp-2 leading-snug">
            {product.name}
          </h3>

          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="truncate">{product.supplierName}</span>
            <span>•</span>
            <span className="flex items-center gap-0.5 shrink-0">
              <MapPin className="w-3 h-3 text-slate-400" />
              {product.supplierCity}
            </span>
          </div>

          <div className="flex items-center gap-1 text-xs pt-1">
            <div className="flex text-amber-400">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={cn(
                    "w-3.5 h-3.5",
                    i < Math.floor(product.rating) ? "fill-amber-400" : "fill-slate-200 dark:fill-slate-700 text-slate-200 dark:text-slate-700"
                  )}
                />
              ))}
            </div>
            <span className="font-semibold text-slate-700 dark:text-slate-300">{product.rating}</span>
            <span className="text-slate-400 text-[11px]">({product.reviewCount})</span>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
        <div>
          <div className="text-base sm:text-lg font-extrabold text-asan-dark dark:text-emerald-400 leading-none">
            {formatPKR(product.price)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Min: {product.moq} {product.unit}
          </div>
        </div>

        {role !== 'supplier' ? (
          <button
            onClick={handleAddToCart}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-asan-accent hover:bg-asan-accent-hover text-white text-xs font-semibold shadow-md shadow-emerald-700/20 active:scale-95 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Add</span>
          </button>
        ) : (
          <span className="text-[11px] font-medium text-slate-400 italic">
            Supplier View
          </span>
        )}
      </div>
    </motion.div>
  );
}