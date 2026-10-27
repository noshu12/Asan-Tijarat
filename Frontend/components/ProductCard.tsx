"use client";

import React, { useState } from 'react';
import { Product } from '@/lib/types';
import { formatPKR } from '@/lib/utils';
import { MapPin, Plus, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ProductImage } from '@/components/ProductImage';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthProvider';
import { addToCart } from '@/lib/cart';

export function ProductCard({ product }: { product: Product }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [added, setAdded] = useState(false);
  const canBuy = !authLoading && (!user || user.role === 'shopkeeper');

  const handleAdd = () => {
    // Guests are bounced to sign-in; suppliers manage listings from their portal.
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

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="group rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm hover:shadow-xl dark:border-slate-800 dark:bg-slate-900 transition-all flex flex-col justify-between"
    >
      <div>
        <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
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
  );
}
